#!/usr/bin/python3

# Copyright 2019 Anton Khirnov <anton@fflabs.eu>
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of
# this software and associated documentation files (the "Software"), to deal in
# the Software without restriction, including without limitation the rights to
# use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
# the Software, and to permit persons to whom the Software is furnished to do so,
# subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
# FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
# COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
# IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


import argparse
import contextlib
import os
import os.path
from  http import HTTPStatus
import http.server as hs
import logging
import shutil
import socket
import sys
import threading
import time
import numpy as np
import re
from datetime import datetime
from datetime import timedelta

# monkey-patch in ThreadingHTTPServer for older python versions
if sys.version_info.minor < 7:
    import socketserver
    class ThreadingHTTPServer(socketserver.ThreadingMixIn, hs.HTTPServer):
        daemon_threads = True
    hs.ThreadingHTTPServer = ThreadingHTTPServer

class HTTPChunkedRequestReader:

    _stream = None
    _eof    = False

    _logger = None

    def __init__(self, stream, logger):
        self._stream = stream
        self._logger = logger

    def read(self):
        if self._eof:
            return bytes()

        l = self._stream.readline().decode('ascii', errors = 'replace')
        # self._logger.debug('reading chunk: chunksize %d' % int(l.split(';')[0], 16))

        try:
            chunk_size = int(l.split(';')[0], 16)
        except ValueError:
            raise IOError('Invalid chunksize line: %d' % l)
        if chunk_size < 0:
            raise IOError('Invalid negative chunksize: %d' % chunk_size)
        if chunk_size == 0:
            self._eof = True
            return bytes()

        data      = bytes()
        remainder = chunk_size
        while remainder > 0:
            read = self._stream.read(remainder)
            if len(read) == 0:
                raise IOError('Premature EOF')

            data      += read
            remainder -= len(read)

        term_line = self._stream.readline().decode('ascii', errors = 'replace')
        if term_line != '\r\n':
            raise IOError('Invalid chunk terminator: %s' % term_line)

        return data

class HTTPRequestReader:

    _stream    = None
    _remainder = 0
    _eof       = False
    _logger = None

    def __init__(self, stream, request_size,logger):
        self._stream    = stream
        self._remainder = request_size
        self._eof       = request_size == 0
        self._logger = logger

    def read(self):
        if self._eof:
            return bytes()

        read = self._stream.read1(self._remainder)
        if len(read) == 0:
            raise IOError('Premature EOF')

        self._remainder -= len(read)
        self._eof        = self._remainder <= 0

        return read

class DataStream:

    _data      = None
    _data_cond = None
    _eof       = False
    _logger  = None

    def __init__(self,logger):
        self._data      = []
        self._data_cond = threading.Condition()
        self._logger  = logger

    def close(self):
        with self._data_cond:
            self._eof = True
            self._data_cond.notify_all()

    def write(self, data):
        with self._data_cond:
            if len(data) == 0:
                self._eof = True
            else:
                if self._eof:
                    raise ValueError('Tried to write data after EOF')

                self._data.append(data)

            self._data_cond.notify_all()

    def read(self, chunk):
        with self._data_cond:
            while self._eof is False and chunk >= len(self._data):
                self._data_cond.wait()

            if chunk < len(self._data):
                return self._data[chunk]

            return bytes()

class StreamCache:

    _streams = None
    _lock    = None
    _logger  = None

    def __init__(self, logger):
        self._streams = {}
        self._lock    = threading.Lock()
        self._logger  = logger

    def __getitem__(self, key):
        # self._logger.debug('reading from cache: %s', key)
        with self._lock:
            return self._streams[key]

    @contextlib.contextmanager
    def add_entry(self, key, val):
        # self._logger.debug('cache add: %s', key)
        with self._lock:
            # if key in self._streams:
            #     raise ValueError('Duplicate cache entry: %s' % key)
            self._streams[key] = val
        try:
            yield val
        finally:
            return 
            # with self._lock:
            #     del self._streams[key]
            # self._logger.debug('cache delete: %s', key)

cur_chunk=-1
last_time=-1
first_mpd=1

class DashRequestHandler(hs.BaseHTTPRequestHandler):
    # required for chunked transfer
    protocol_version = "HTTP/1.1"

    _logger = None

    def __init__(self, *args, **kwargs):
        server = args[2]
        self._logger = server._logger.getChild('requesthandler')

        super().__init__(*args, **kwargs)
        # self._logger.info("in init")

    def _decode_path(self, encoded_path):
        # FIXME implement unquoting
        # self._logger.info("in decode_path")
        return encoded_path
    
    def send_chunk(self,infile,flag,real_flag,speed):
        global last_time
        global cur_chunk
        chunk = 0
        
        data = infile.read()
        total_len=len(data)
        tosend=[]
        idx=0
        curtime=time.time()
        lasttime=curtime

        while True:
            cur_len=int(data[idx:idx+4].hex(),base=16)
            cur_type=str(data[idx+4:idx+8].decode())
            # self._logger.info("idx %d, cur len %d, cur type %s",idx,cur_len,cur_type)
            idx=idx+cur_len
            if (cur_type=="mdat"):
                tosend.append(idx)
            if (len(data)==idx): break

        if (flag>0):
            idx=tosend[flag-1]
            tmp_data=data[:idx]
            self._logger.info("sending cached chunk %d, len %d/%d,%f,time %s",flag-1,len(tmp_data),total_len,len(tmp_data)/total_len,lasttime)
            self.wfile.write(hex(len(tmp_data))[2:].encode('ascii') + b'\r\n')
            self.wfile.write(tmp_data)
            self.wfile.write(b'\r\n')

        for i in range (flag,len(tosend)):
            end=tosend[i]
            limbo=speed/15
            curtime=time.time()
            if (i==0): start=0
            else: start=tosend[i-1]

            tmp_data=data[start:end]
            cha=curtime-lasttime
            # self._logger.info("lasttime %s, curtime %s,cha %s, sleep limbo %s",lasttime,curtime,cha,limbo)
            
            if (cha<limbo): time.sleep(limbo-cha)

            self.wfile.write(hex(len(tmp_data))[2:].encode('ascii') + b'\r\n')
            self.wfile.write(tmp_data)
            self.wfile.write(b'\r\n')
            lasttime=time.time()
            self._logger.info("sending idle chunk %d, len %d/%d,%f,time %s",i,len(tmp_data),total_len,len(tmp_data)/total_len,lasttime)
        self.wfile.write(b'0\r\n\r\n')
        curtime=time.time()
        cha=curtime-last_time
        cur_chunk=cur_chunk+15*cha/speed
        last_time=curtime

    def _serve_local(self, path,flag,speed):
        # self._logger.info("in serve_local path %s",path)
        with open(path, 'rb') as infile:
            stat = os.fstat(infile.fileno())

            if ("chunk" not in path):
                self.send_response(HTTPStatus.OK)
                self.send_header('Content-Length', str(stat.st_size))
                curtime=int(1000*time.time())
                # self._logger.info("curtime %s",curtime)
                self.send_header('SendTime', str(curtime))
                self.send_header('Access-Control-Expose-Headers', 'SendTime')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                # self._logger.info("server live mpd or init")
                shutil.copyfileobj(infile, self.wfile)
            else:
                real_flag=flag
                tosleep=max(speed/15*(real_flag-flag),0)
                # self._logger.info("to sleep %f",tosleep)
                time.sleep(tosleep)
                self.send_response(HTTPStatus.OK)
                self.send_header('Transfer-Encoding', 'chunked')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('flag', str(int(real_flag)))
                self.send_header('Access-Control-Expose-Headers', 'flag')
                self.end_headers()
                # self._logger.info("server chunk")
                self.send_chunk(infile,flag,real_flag,speed)
            # shutil.copyfileobj(infile, self.wfile)

    def _log_request(self):
        # self._logger.info("in log_request")
        # self._logger.info('%s: %s', str(self.client_address), self.requestline)
        # self._logger.debug('headers:\n%s', self.headers)
        return

    def do_GET(self):
        global cur_chunk
        global last_time
        global first_mpd
        self._log_request()

        local_path = self._decode_path(self.path)
        outpath = '%s%s' % (self.server.serve_dir, local_path)
        self._logger.info("in do get, serve path %s, local path %s, time %s",self.server.serve_dir, local_path,time.time())

        
        if ("mpd" in local_path):
            with open('./media/live/live.mpd') as f:
                mpd = f.read()
            pattern = r'publishTime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)"'
            match = re.search(pattern, mpd)
            pub_time = match.group(1)

            pattern = r'availabilityStartTime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)"'
            match = re.search(pattern, mpd)
            av_time = match.group(1)
            now = datetime.utcnow()
            past = now - timedelta(seconds=10)

            now=now.strftime("%Y-%m-%dT%H:%M:%S.%fZ") 
            past=past.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

            if first_mpd==1:
                # self._logger.info("first mpd")
                mpd = mpd.replace("availabilityStartTime=\""+av_time+"\"", "availabilityStartTime=\""+past+"\"")
                cur_chunk=10*30
                last_time=time.time()
                # first_mpd=0
            mpd = mpd.replace("publishTime=\""+pub_time+"\"", "publishTime=\""+now+"\"")
            with open('./media/live/live.mpd', 'w') as f:
                f.write(mpd)

        flag=0
        speed=0.5
        if ("chunk" in local_path):
            tmp_path=local_path.split('/')[-1]
            tmp_path=tmp_path.split('.')[0]
            tmp_path_str=tmp_path.split('-')[-1]
            tmp_path=int(tmp_path_str)

            if (tmp_path%1270==0):
                real_path=1270
            else:
                real_path=tmp_path%1270

            real_path=str(real_path)
            real_path="0"*(5-len(real_path))+real_path

            if (last_time==-1):
                cur_chunk=(tmp_path-1)*15+7
                last_time=time.time()
                speed=0.5
                flag=7
                self._logger.info("init idx %d, time %s",cur_chunk/15,last_time)
            else:
                curtime=time.time()
                cha=curtime-last_time
                speed=0.5+0.00*np.random.rand()
                
                cur_chunk=cur_chunk+15*cha/speed
                cur_chunk_int=np.floor(cur_chunk)

                last_time=curtime

                real_seg=np.floor(cur_chunk_int/15)
                
                if (real_seg>=tmp_path):
                    flag=15
                elif (real_seg+1==tmp_path):
                    flag=int(cur_chunk_int-real_seg*15)
                else:
                    wait_ts=speed*(tmp_path-cur_chunk_int/15-1)
                    self._logger.info("all wrong !!!!! %d,%d",real_seg,tmp_path)
                    time.sleep(wait_ts)
                    flag=0

                self._logger.info("real seg %d, flag %d, speed %f, curtime %s",real_seg,flag,speed,curtime)
            # local_path=local_path.replace(tmp_path_str,real_path)
            # outpath = '%s%s' % (self.server.serve_dir, local_path)
            # self._logger.info("local %s",local_path)
        try:
            if os.path.exists(outpath):
                # self._logger.info("in error %s",local_path)
                # self._logger.info('serve local: %s', local_path)
                return self._serve_local(outpath,flag,speed)
            ds = self.server._streams[local_path]
            # self._logger.info("in ds")
        except KeyError:
            if os.path.exists(outpath):
                # self._logger.info('serve local: %s', local_path)
                return self._serve_local(outpath,flag,speed)
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.OK)
        self.send_header('Transfer-Encoding', 'chunked')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        chunk = 0
        while True:
            data = ds.read(chunk)
            if len(data) == 0:
                self.wfile.write(b'0\r\n\r\n')
                break

            chunk += 1


            # if ("live.mpd" not in local_path and "init" not in local_path):
            #     idx=0
            #     import copy
            #     mydata=copy.deepcopy(data)
            #     self._logger.info("mydata %s",mydata)
            #     while True:
            #         cur_len=int(mydata[idx:idx+4].hex(),base=16)
            #         cur_type=str(mydata[idx+4:idx+8].decode())
            #         self._logger.info("idx %d, cur len %d, cur type %s",idx,cur_len,cur_type)
            #         idx=idx+cur_len

            #         if (cur_type in ["mdat","styp"]):
            #             tmp_data=mydata[:idx]
            #             # self.wfile.write(hex(len(tmp_data))[2:].encode('ascii') + b'\r\n')
            #             # self.wfile.write(tmp_data)
            #             # self.wfile.write(b'\r\n')
            #             self._logger.info("sending chunk %s %d, len %d",int(hex(len(tmp_data))[2:],16),chunk,len(tmp_data))
            #             mydata=mydata[idx:]
            #             # chunk += 1
            #             # idx=0
            #             break
            
            self.wfile.write(hex(len(data))[2:].encode('ascii') + b'\r\n')
            self.wfile.write(data)
            self.wfile.write(b'\r\n')

            # self.wfile.write(b'0\r\n\r\n')
            # time.sleep(20e-3)
            # self._logger.info("in do get ds %s %d,%d,time %s",local_path,chunk,len(data),time.time())

    def do_POST(self):
        # self._logger.info("in do post")
        print("in do post,header ",self.headers)
        self._log_request()
        # if ("live.mpd" in self.path): return

        with contextlib.ExitStack() as stack:
            local_path = self._decode_path(self.path)

            ds = stack.enter_context(contextlib.closing(DataStream(self._logger.getChild('datastream'))))
            stack.enter_context(self.server._streams.add_entry(local_path, ds))

            if 'Transfer-Encoding' in self.headers:
                if self.headers['Transfer-Encoding'] != 'chunked':
                    return self.send_error(HTTPStatus.NOT_IMPLEMENTED,
                                            'Unsupported Transfer-Encoding: %s' %
                                            self.headers['Transfer-Encoding'])
                infile = HTTPChunkedRequestReader(self.rfile, self._logger.getChild('chreader'))
            elif 'Content-Length' in self.headers:
                infile = HTTPRequestReader(self.rfile, int(self.headers['Content-Length']),self._logger.getChild('requestreader'))
            else:
                return self.send_error(HTTPStatus.BAD_REQUEST)

            outpath    = '%s%s' % (self.server.serve_dir, local_path)
            write_path = outpath + '.tmp'
            outfile    = stack.enter_context(open(write_path, 'wb'))
            while True:
                data = infile.read()

                ds.write(data)
                if len(data) == 0:
                    # self._logger.debug('Finished reading')
                    break

                written = outfile.write(data)
                if written < len(data):
                    raise IOError('partial write: %d < %d' % (written, len(data)))

                # self._logger.debug('in post streamed %d bytes', len(data))

            retcode = HTTPStatus.NO_CONTENT if os.path.exists(outpath) else HTTPStatus.CREATED
            os.replace(write_path, outpath)

        self.send_response(retcode)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_PUT(self):
        self._logger.info("in do put")
        return self.do_POST()

class DashServer(hs.ThreadingHTTPServer):

    serve_dir = None

    # files currently being uploaded, indexed by their URL
    # should only be accessed by the request instances spawned by this server
    _streams = None

    _logger  = None

    def __init__(self, address, force_v4, force_v6, serve_dir, logger):
        self.serve_dir     = serve_dir
        self._streams      = StreamCache(logger.getChild('streamcache'))
        self._logger       = logger

        family = None
        if force_v4:
            family = socket.AF_INET
        elif force_v6:
            family = socket.AF_INET6

        if family is None and len(address[0]):
            try:
                family, _, _, _, _ = socket.getaddrinfo(*address)[0]
            except IndexError:
                pass

        if family is None:
            family = socket.AF_INET6

        self.address_family = family
        self._logger.info("address %s, serve_dir %s",address,self.serve_dir)

        super().__init__(address, DashRequestHandler)

def main(argv):
    parser = argparse.ArgumentParser('DASH server')

    parser.add_argument('-a', '--address', default = 'localhost')
    parser.add_argument('-p', '--port',    type = int, default = 8000)

    group = parser.add_mutually_exclusive_group()
    group.add_argument('-4', '--ipv4',    action = 'store_true')
    group.add_argument('-6', '--ipv6',    action = 'store_true')

    parser.add_argument('-l', '--loglevel', default = 'WARNING')

    parser.add_argument('directory')

    args = parser.parse_args(argv[1:])

    logging.basicConfig(filename='server.log', level = args.loglevel)
    logger = logging.getLogger('DashServer')

    server = DashServer((args.address, args.port), args.ipv4, args.ipv6,
                        args.directory, logger)
    server.serve_forever()

if __name__ == '__main__':
    main(sys.argv)
