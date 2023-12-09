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
import tqdm
import matplotlib.pyplot as plt
from matplotlib.pyplot import plot, savefig
import matplotlib
bitrate=[200,600,1000,2500,4000,6000]

def send_chunk(infile):
    data = infile.read()
    total_len=len(data)
    tosend=[]
    res=[]
    idx=0
    while True:
        cur_len=int(data[idx:idx+4].hex(),base=16)
        cur_type=str(data[idx+4:idx+8].decode())
        # self._logger.info("idx %d, cur len %d, cur type %s",idx,cur_len,cur_type)
        idx=idx+cur_len
        if (cur_type=="mdat"):
            tosend.append(idx)
        if (len(data)==idx): break

    for i in range (len(tosend)):
        end=tosend[i]
        if (i==0): start=0
        else: start=tosend[i-1]
        tmp_data=data[start:end]
        res.append(len(tmp_data))
    return res

def plot_buffer(streams):
    streams=np.array(streams)
    esti=np.zeros((streams.shape[0],streams.shape[1]))
    for i in range (len(bitrate)):
        esti[i,:]=(bitrate[i]*0.5*1000/8)

    error=(streams-esti)/(esti+1e-9)
    labels=bitrate
    # draw cdfs
    plt.rcParams['axes.labelsize'] = 18
    font = {'size': 18}
    matplotlib.rc('font', **font)
    #matplotlib.rc('text', usetex=True)
    fig, ax = plt.subplots(figsize=(5, 3))
    plt.subplots_adjust(left=0.21, bottom=0.22, right=0.94, top=0.96)

    lines = ['-', '--', '-.', ':', '--','-','-.']
    #colors = ['red', 'blue', 'orange', 'green', 'black']

    def rgb_to_hex(rr, gg, bb):
        rgb = (rr, gg, bb)
        return '#%02x%02x%02x' % rgb

    # colors = [rgb_to_hex(237, 65, 29), rgb_to_hex(102, 49, 160), rgb_to_hex(
    #     255, 192, 0), rgb_to_hex(29, 29, 29), rgb_to_hex(0, 212, 97)]
    colors = [rgb_to_hex(47, 103, 223), rgb_to_hex(239, 117, 38), rgb_to_hex(
        121, 90, 158), rgb_to_hex(68, 166, 69), rgb_to_hex(29, 29, 29),rgb_to_hex(169, 169, 169),rgb_to_hex(229, 0, 129)]
    markers = ['o','>','v','^','x','<','s','p','*','h','H','D','d','1']
    LW = 2.1
    for (scheme, label, marker, color, line) in zip(error, labels, markers, colors, lines):
        arr = scheme
        NUM_BINS = 10000 + 1
        values, base = np.histogram(arr, bins=NUM_BINS)
        cumulative = np.cumsum(values)
        cumulative = cumulative / np.max(cumulative)
        ax.plot(base[:-1], cumulative, color=color, lw=LW,
            markevery = 2500, markersize = 12, marker = 'none', markerfacecolor='white',
            label=label)

    ax.legend(framealpha=1, loc='best',
                frameon=False, fontsize=16)

    # plt.xlim(-5., 150.)
    # plt.xticks([0., 5., 10., 15., 20., 25., 30., 35., 40.])
    ax.spines['bottom'].set_linewidth(1.5)
    ax.spines['left'].set_linewidth(1.5)
    ax.spines['right'].set_linewidth(1.5)
    ax.spines['top'].set_linewidth(1.5)
    plt.ylim(0.0, 1.02)
    # plt.xlim(0.0, 0.002)
    plt.yticks([0., 0.25, 0.5, 0.75, 1.0])
    plt.ylabel('CDF')
    plt.grid(linestyle='--')
    plt.xlabel("Relative Error")
    savefig("./videos/size.pdf")
    

def main():
    chunks=os.listdir("./media/live/")
    chunks.sort()
    streams=np.zeros((6,1271))
    for i in chunks:
        if ("init" in i or "mpd" in i): continue
        match = re.search(r'stream(\d+)-(\d{5})', i)
        stream_num = match.group(1) 
        stream_num=int(stream_num)
        id_num = match.group(2)
        id_num=int(id_num)
        if (id_num>1270): continue
        path="./media/live/"+i
        infile=open(path, 'rb')
        data=infile.read()
        # res=send_chunk(infile)
        streams[stream_num][id_num]=len(data)
        # print(stream_num,id_num,streams[stream_num][id_num][:15],np.sum(streams[stream_num][id_num][:15]))
    # handle(streams)
    plot_buffer(streams)
main()