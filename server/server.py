#!/usr/bin/env python
from http.server import BaseHTTPRequestHandler, HTTPServer
import socketserver
import base64
import urllib
import sys
import os
import json
import time
os.environ['CUDA_VISIBLE_DEVICES']=''
from const import *
# from models.ABR import *
# from models.pensieve.pensieve_abr import Pensieve

import numpy as np
import time
import itertools

import online as oncd
from functools import partial
import a
from collections import OrderedDict

# Define port map: [abr: port]
abr_port_dict = {
    'pensieve': 12300,
    'bb': 12301,
    'rb': 12302,
    'festive': 12303,
    'mpc': 12304,
    'fastmpc': 12305,
    'simple': 12306
}

m_idx=-1
m_state=[]

config=a.configmap_buffer_oboe_900
new_config={}
# print(config)
config_list=list(config.keys())
for i in range (len(config_list)):
    keys=config_list[i]
    cur=config[keys]
    new_keys=(keys[2],keys[3])
    new_config[new_keys]=cur
    # print(i,keys,cur,new_keys,new_config[new_keys])


new_config = OrderedDict(sorted(new_config.items(), key=lambda x: (x[0][1], x[0][0])))
print(list(new_config.keys())[0],list(new_config.keys())[-1])

def trimPlayerVisibleBW(player_visible_bw, thresh):
    ret = []
    cutoff = 0
    lenarray = len(player_visible_bw)
    if lenarray <= thresh:
        return player_visible_bw, cutoff

    cutoff = lenarray - thresh
    ret = player_visible_bw[cutoff:]
    return ret, cutoff


def onlineCD(chunk_when_last_chd, player_visible_bw, interval=5):
    chd_detected = False
    chd_index = chunk_when_last_chd
    trimThresh = 1000.
    player_visible_bw, cutoff = trimPlayerVisibleBW(
        player_visible_bw, trimThresh)
    R, maxes = oncd.online_changepoint_detection(np.asanyarray(player_visible_bw), partial(
        oncd.constant_hazard, 250), oncd.StudentT(0.1, 0.01, 1, 0))
    interval = min(interval, len(player_visible_bw))
    changeArray = R[interval, interval:-1]
    # reversed(list(enumerate(changeArray))): # enumerate(changeArray):
    for i, v in reversed(list(enumerate(changeArray))):
        if v > 0.01 and i + cutoff > chunk_when_last_chd and not (i == 0 and chunk_when_last_chd > -1):
            chd_index = i + cutoff
            chd_detected = True
            break
    return chd_detected, chd_index

def approximate_search(ordered_dict, key_query):
  dict_keys=list(ordered_dict.keys())
  low = 0 
  high = len(dict_keys) - 1

  if (dict_keys[high][1]<key_query[1]):
      return high,high
  elif (dict_keys[low][1]>key_query[1]):
      return -1,-1
  
  # 使用二分查找找到b对应的索引范围
  while low <= high:
    mid = (low + high) // 2
    if dict_keys[mid][1] < key_query[1]:
      low = mid + 1
    elif dict_keys[mid][1] > key_query[1]: 
      high = mid - 1
    else:
      return mid,mid
      
  # 返回b范围内第一个和最后一个key      
  return max(low-1,0),min(high+1,len(dict_keys)-1)

def getDynamicconfig_mpc(pv_list_hyb, bw, std, step=900):
    bw=int(bw)
    std=int(std)
    bw_step = step
    std_step = step
    bw_cut = int(float(bw)/bw_step)*bw_step
    std_cut = int(float(std)/std_step)*std_step
    current_list_hyb = list()
    count = 0
    low,high=approximate_search(pv_list_hyb,(bw,std))
    # print((bw,std))
    if (low==-1 and high==-1):
        current_list_hyb=[1]*10
    else:
        for i in range (low,high+1):
            cur_key=list(pv_list_hyb.keys())[i]
            # print(cur_key,pv_list_hyb[cur_key])
            current_list_hyb = current_list_hyb + pv_list_hyb[cur_key]
    # if True:
    #     if bw == -1 and std == -1:
    #         return 0.0, 0.0, 0.0
    #     # if key not in performance vector
    #     if (bw_cut, std_cut) not in list(pv_list_hyb.keys()):
    #         for i in range(2, 1000, 1):
    #             count += 1
    #             for bw_ in [bw_cut - (i - 1) * bw_step, bw_cut + (i-1) * bw_step]:
    #                 for std_ in range(std_cut - (i - 1) * std_step, std_cut + (i-1) * std_step + std_step, std_step):
    #                     if (bw_, std_) in list(pv_list_hyb.keys()):
    #                         current_list_hyb = current_list_hyb + \
    #                             pv_list_hyb[(bw_, std_)]
    #             for std_ in [std_cut - (i - 1) * std_step, std_cut + (i-1) * std_step]:
    #                 for bw_ in range(bw_cut - (i - 2) * bw_step, bw_cut + (i-1) * bw_step, bw_step):
    #                     if (bw_, std_) in list(pv_list_hyb.keys()):
    #                         current_list_hyb = current_list_hyb + \
    #                             pv_list_hyb[(bw_, std_)]
    #             if len(current_list_hyb) == 0:
    #                 continue
    #             else:  # len(abr_list)>0 and 'BB' not in abr_list:
    #                 break
    #     else:
    #         current_list_hyb = current_list_hyb + \
    #             pv_list_hyb[(bw_cut, std_cut)]

    if len(current_list_hyb) == 0:
        return 0.0, 0.0, 0.0
    if max(current_list_hyb) == -1.0:
        return 0.0, 0.0, 0.0
    return min(current_list_hyb), np.percentile(current_list_hyb, 50), max(current_list_hyb)

def handle(ch_index,state):
    global new_config
    # print(ch_index,state)
    ch_detected, ch_idx = onlineCD(ch_index, state)

    ch_detected=True
    ch_idx=-20
    
    discount=0.9
    if ch_detected:
        ch_index = ch_idx
        state_arr = state[ch_index:]
        mean_bandwidth = np.mean(state_arr)
        std_bandwidth = np.std(state_arr)
        
        disc_min, disc_median, disc_max = getDynamicconfig_mpc(
            new_config, mean_bandwidth, std_bandwidth)
        discount = disc_median
    return ch_index,discount


def make_request_handler(abr_model, input_dict):
    class Request_Handler(BaseHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            self.input_dict = input_dict
            # self.log_file = input_dict['log_file']
            
            BaseHTTPRequestHandler.__init__(self, *args, **kwargs)

        def do_POST(self):
            global m_idx
            global m_state
            content_length = int(self.headers['Content-Length'])
            post_data = json.loads(self.rfile.read(content_length))
            cur_bw=float(post_data['bw'])
            cur_state=int(1000*100*float(post_data['error']))

            if (cur_bw==-1):
                m_idx=-1
                m_state=[]
            m_state.append(cur_state)
            discount=0.9
            tmp_idx,discount=handle(m_idx,m_state)
            m_idx=tmp_idx

            print(len(m_state),post_data,discount)

            send_data=str(float(discount))

            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', len(send_data))
            self.send_header('Access-Control-Allow-Origin', "*")
            self.end_headers()
            self.wfile.write(send_data.encode())

        def do_GET(self):
            print('GOT REQ',sys.stderr)
            self.send_response(200)
            #self.send_header('Cache-Control', 'Cache-Control: no-cache, no-store, must-revalidate max-age=0')
            self.send_header('Cache-Control', 'max-age=3000')
            self.send_header('Content-Length', 20)
            self.end_headers()
            self.wfile.write("console.log('here');")

        def log_message(self, format, *args):
            return

    return Request_Handler


def run(ABR,server_class=HTTPServer, port=8333):

    np.random.seed(RANDOM_SEED)
    abr=ABR

    # if not os.path.exists(SUMMARY_DIR):
    #     os.mkdir(SUMMARY_DIR)

    # if ABR=='bb': abr=BB()
    # elif ABR=='rb': abr=RB()
    # elif ABR=='mpc': abr=MPC()
    # elif ABR == 'fastmpc': abr=FastMPC()
    # elif ABR == 'festive': abr=Festive()
    # elif ABR == 'pensieve': abr=Pensieve()
    # elif ABR == 'simple': abr=None
    # else:
    #     raise NotImplementedError(f"Unrecognized ABR algo: {ABR}.")

    last_bit_rate = DEFAULT_QUALITY
    last_total_rebuf = 0
    # need this storage, because observation only contains total rebuffering time
    # we compute the difference to get

    video_chunk_count = 0

    input_dict = {
                    'last_bit_rate': last_bit_rate,
                    'last_total_rebuf': last_total_rebuf,
                    'video_chunk_count': video_chunk_count}

    # interface to abr_rl server
    handler_class = make_request_handler(abr_model=abr, input_dict=input_dict)
    server_address = ("101.6.41.182", port)
    httpd = server_class(server_address, handler_class)
    print('Listening on port ' + str(port))
    httpd.serve_forever()

def main():
    abr=sys.argv[1]
    # trace_file = sys.argv[2]
    print(f'Usage: python3 server.py [abr] [trace_name]')
    # print(f'ABR: {abr} Port: {abr_port_dict[abr]} Trace: {trace_file}')
    # port=sys.argv[3]
    # print(sys.argv)
    if abr not in ['bb','rb','mpc','festive','fastmpc','pensieve', 'simple']: 
        raise NotImplementedError(f"Unrecognized ABR algo: {abr}.")
    # if os.path.exists(LOG_FILE + 'server')==0: os.mkdir(LOG_FILE + 'server')
    # if os.path.exists(LOG_FILE + 'server/'+abr)==0: os.mkdir(LOG_FILE + 'server/'+abr)
    run(ABR=abr, port=abr_port_dict[abr])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Keyboard interrupted.")
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)
