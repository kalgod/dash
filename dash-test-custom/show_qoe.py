import os
import tqdm
import numpy as np
import json
import sys
from const import *

mode=int(sys.argv[1])
alg=str(sys.argv[2])

pre_path="./results/"
traces=os.listdir(pre_path)
traces.sort()

import matplotlib.pyplot as plt
from matplotlib.pyplot import plot, savefig
import matplotlib

def plot_qoe(mea,pre,real,bit,trace,bw):
    TEST_LOG_FOLDER = './'
    SCHEMES=['BW-M','BW-P','BW-R','Bitrate']
    labels = SCHEMES
    #outputname="BBA与MPC对比"
    outputname="./results/"+trace+"/"+bw+"/"+alg+"/qoe"
    # mea=np.array(mea)[:,0]
    # pre.insert(0,0)
    # pre=pre[:-1]
    results_all=[mea,pre,real,bit]
    #outputname="reward"
    plt.rcParams['axes.labelsize'] = 18
    font = {'size': 18}
    matplotlib.rc('font', **font)
    #matplotlib.rc('text', usetex=True)
    fig, ax = plt.subplots(figsize=(5, 3))
    plt.subplots_adjust(left=0.21, bottom=0.22, right=0.94, top=0.96)

    lines = ['-', '--', '-.', ':', '--', '-', '-.', ':', '--', '-']
    #colors = ['red', 'blue', 'orange', 'green', 'black']

    def rgb_to_hex(rr, gg, bb):
        rgb = (rr, gg, bb)
        return '#%02x%02x%02x' % rgb

    colors = [rgb_to_hex(47, 103, 223), rgb_to_hex(239, 117, 38), rgb_to_hex(
        121, 90, 158), rgb_to_hex(68, 166, 69), rgb_to_hex(34, 34, 34), rgb_to_hex(237, 65, 29), 
        rgb_to_hex(102, 49, 160), rgb_to_hex(255, 192, 0)]
    markers = ['o','>','v','^','*','<','s','p','*','h','H','D','d','1']

    xs=[]
    total_len=len(mea)
    for i in range (total_len): xs.append(i+1)
    # ax.plot(xs, [200]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>600)): ax.plot(xs, [600]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>1000)):ax.plot(xs, [1000]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>2000)):ax.plot(xs, [2000]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>4000)):ax.plot(xs, [4000]*total_len, color='black', lw=1.3)

    for (scheme, label, marker, color, line) in zip(results_all, labels, markers, colors, lines):
        ax.plot(xs, scheme, color=color, lw=1.3, label=label)

    ax.legend(loc='upper center', bbox_to_anchor=(0.5, 1), ncol=2,fontsize=15)

    #plt.xlim(-2., 1.1)
    # plt.xticks([0., 5., 10., 15., 20., 25., 30., 35., 40.])
    ax.spines['bottom'].set_linewidth(1.5)
    ax.spines['left'].set_linewidth(1.5)
    ax.spines['right'].set_linewidth(1.5)
    ax.spines['top'].set_linewidth(1.5)
    # plt.ylim(0, 2500)
    #plt.yticks([0., 0.25, 0.5, 0.75, 1.0])
    plt.ylabel('Bandwidth(Kbps)')
    plt.grid()
    plt.xlabel('Segment')
    path_tmp=outputname+".pdf"
    savefig(path_tmp)
    plt.close()

def plot_error(mea,pre,buffer_error,chunk_error):
    TEST_LOG_FOLDER = './'
    SCHEMES=['Bandwidth','Buffer','Segment Size']
    labels = SCHEMES
    #outputname="BBA与MPC对比"
    outputname="./results/"+trace+"/"+bw+"/"+alg+"/error"
    band_error=(pre-mea)/(mea+1e-9)
    buffer_error=np.array(buffer_error)
    # for i in range(len(buffer_error)):
    #     # print(buffer_error[i])
    #     buffer_error[i]=min(buffer_error[i],0.2)
    #     buffer_error[i]=max(buffer_error[i],-0.3)
        
    # print(len(band_error),len(buffer_error),len(chunk_error))
    results_all=[band_error[:-1],buffer_error,chunk_error[:-1]]
    #outputname="reward"
    plt.rcParams['axes.labelsize'] = 18
    font = {'size': 18}
    matplotlib.rc('font', **font)
    #matplotlib.rc('text', usetex=True)
    fig, ax = plt.subplots(figsize=(5, 3))
    plt.subplots_adjust(left=0.21, bottom=0.22, right=0.94, top=0.96)

    lines = ['-', '--', '-.', ':', '--', '-', '-.', ':', '--', '-']
    #colors = ['red', 'blue', 'orange', 'green', 'black']

    def rgb_to_hex(rr, gg, bb):
        rgb = (rr, gg, bb)
        return '#%02x%02x%02x' % rgb

    colors = [rgb_to_hex(47, 103, 223), rgb_to_hex(239, 117, 38), rgb_to_hex(
        121, 90, 158), rgb_to_hex(68, 166, 69), rgb_to_hex(34, 34, 34), rgb_to_hex(237, 65, 29), 
        rgb_to_hex(102, 49, 160), rgb_to_hex(255, 192, 0)]
    markers = ['o','>','v','^','*','<','s','p','*','h','H','D','d','1']

    xs=[]
    total_len=len(buffer_error)
    for i in range (total_len): xs.append(i+1)
    # ax.plot(xs, [200]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>600)): ax.plot(xs, [600]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>1000)):ax.plot(xs, [1000]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>2000)):ax.plot(xs, [2000]*total_len, color='black', lw=1.3)
    # if (np.max(np.array(real)>4000)):ax.plot(xs, [4000]*total_len, color='black', lw=1.3)

    for (scheme, label, marker, color, line) in zip(results_all, labels, markers, colors, lines):
        ax.plot(xs, scheme, color=color, lw=1.3, label=label)

    ax.legend(framealpha=1, loc='best',
                frameon=False, fontsize=14)

    #plt.xlim(-2., 1.1)
    # plt.xticks([0., 5., 10., 15., 20., 25., 30., 35., 40.])
    ax.spines['bottom'].set_linewidth(1.5)
    ax.spines['left'].set_linewidth(1.5)
    ax.spines['right'].set_linewidth(1.5)
    ax.spines['top'].set_linewidth(1.5)
    plt.ylim(-1.0, 1.0)
    #plt.yticks([0., 0.25, 0.5, 0.75, 1.0])
    # plt.xticks([0,20,21,22,23,24, 25,26,27,28,29,30,50,75,100])
    plt.ylabel('Relative Error')
    plt.grid()
    plt.xlabel('Segment')
    path_tmp=outputname+".pdf"
    savefig(path_tmp)
    plt.close()

def plot_buffer(buf,abs_time,l,trace,bw,buffer_error):
    TEST_LOG_FOLDER = './'
    SCHEMES=['Buffer-Real','Latency','Buffer-Predict']
    labels = SCHEMES
    #outputname="BBA与MPC对比"
    outputname="./results/"+trace+"/"+bw+"/"+alg+"/buffer"
    pre_buffer=(1+np.array(buffer_error))*np.array(buf[:-1])
    # pre_buffer=np.array(buffer_error)+np.array(buf[:-1])
    results_all=[buf[:-1],l[:-1],pre_buffer]
    #outputname="reward"
    plt.rcParams['axes.labelsize'] = 18
    font = {'size': 18}
    matplotlib.rc('font', **font)
    #matplotlib.rc('text', usetex=True)
    fig, ax = plt.subplots(figsize=(5, 3))
    plt.subplots_adjust(left=0.21, bottom=0.22, right=0.94, top=0.96)

    lines = ['-', '--', '-.', ':', '--', '-', '-.', ':', '--', '-']
    #colors = ['red', 'blue', 'orange', 'green', 'black']

    def rgb_to_hex(rr, gg, bb):
        rgb = (rr, gg, bb)
        return '#%02x%02x%02x' % rgb

    colors = [rgb_to_hex(47, 103, 223), rgb_to_hex(239, 117, 38), rgb_to_hex(
        121, 90, 158), rgb_to_hex(68, 166, 69), rgb_to_hex(34, 34, 34), rgb_to_hex(237, 65, 29), 
        rgb_to_hex(102, 49, 160), rgb_to_hex(255, 192, 0)]
    markers = ['o','>','v','^','*','<','s','p','*','h','H','D','d','1']

    xs=abs_time[:-1]
    xs=[]
    total_len=len(pre_buffer)
    for i in range (total_len): xs.append(i+1)
    for (scheme, label, marker, color, line) in zip(results_all, labels, markers, colors, lines):
        ax.plot(xs, scheme, color=color, lw=1.3,label=label)

    ax.legend(framealpha=1, loc='best',
                frameon=False, fontsize=14)

    #plt.xlim(-2., 1.1)
    # plt.xticks([0., 5., 10., 15., 20., 25., 30., 35., 40.])
    ax.spines['bottom'].set_linewidth(1.5)
    ax.spines['left'].set_linewidth(1.5)
    ax.spines['right'].set_linewidth(1.5)
    ax.spines['top'].set_linewidth(1.5)
    #plt.ylim(-0.05, 1.02)
    #plt.yticks([0., 0.25, 0.5, 0.75, 1.0])
    plt.ylabel('Buffer & Latency/s')
    plt.grid()
    plt.xlabel('Segment')
    path_tmp=outputname+".pdf"
    savefig(path_tmp)
    plt.close()

def comp(mea,pre,trace,bws):
    truth="./bw_truth/"+trace+"/"+bws+"/"+alg
    f=open(truth,"r")
    bw_all=f.readlines()
    for i in range(len(bw_all)):
        bw=bw_all[i].strip().split(" ")
        for j in range(len(bw)):
            bw[j]=float(bw[j])
            if (j==1):
                bw[j]=1000*bw[j]
        bw_all[i]=bw
    # print(bw_all)
    real_all=[]
    res=[]
    for i in range(len(mea)):
        cur_mea=mea[i][0]
        start=mea[i][1]
        end=mea[i][2]
        cur_pre=pre[i]
        for j in range(len(bw_all)):
            if (bw_all[j][1]>start): break
        j-=1
        for k in range(len(bw_all)):
            if (bw_all[k][1]>end): break
        real_bw=-1
        if (k-j==1):
            real_bw=bw_all[j][0]
        else:
            real_bw=bw_all[j][0]*(bw_all[j+1][1]-start)+bw_all[k-1][0]*(end-bw_all[k-1][1])
            for z in range(j+1,k-1):
                real_bw+=bw_all[z][0]*(bw_all[z+1][1]-bw_all[z][1])
            real_bw/=(end-start+1e-9)
        real_bw=real_bw*1024
        cha=abs(cur_mea-real_bw)/(real_bw+1e-9)
        real_all.append(real_bw)
        if (real_bw!=0): res.append(cha)
        # print(i,"  ",end-start,"  ",cur_mea,"  ",real_bw,"  ",cha,"  ",cur_pre)
    # print("mea diff: ",truth,len(res),np.mean(res),np.std(res),np.max(res),np.argmax(res),np.min(res),np.mean(real_all))

    return real_all

def gen_bw(segs):
    mea=[]
    pre=[]
    buffer=[]
    chunksize=[]
    key_l=list(segs.keys())
    for i in range(len(key_l)):
        key=key_l[i]
        if ("chunk" not in key): continue
        seg=segs[key]
        
        cur_mea=float(seg['throughputhis'])
        cur_pre=float(seg['throughputKbps'])
        cur_buffer=float(seg['buffer'])
        start=float(seg['requestInfo']['requestStartDate'])
        end=float(seg['requestInfo']['requestEndDate'])
        cur_chunksize=float(seg['requestInfo']['bytesLoaded'])
        # print(i,key,len(key_l),float(seg['requestInfo']['bytesTotal']),cur_mea,cur_pre)
        mea.append([cur_mea,start,end])
        pre.append(cur_pre)
        buffer.append(cur_buffer)
        chunksize.append(cur_chunksize)
    return mea,pre,buffer,chunksize

def gen(segs,trace,bw):
    bit_max=6000
    bit_min=200
    mea,pre,buffer_error,real_chunk=gen_bw(segs)
    buffer_error=buffer_error[1:]
    real_bw=comp(mea,pre,trace,bw)
    b=[]
    r=[]
    l=[]
    p=[]
    f=[]
    buf=[]
    abs_time=[]
    qoe=0
    bitrate_qoe=0
    rebuf_pen=0
    lat_pen=0
    play_pen=0
    switch_pen=0
    key_l=list(segs.keys())
    for i in range(len(key_l)):
        key=key_l[i]
        if ("chunk" not in key): continue
        seg=segs[key]
        bitrate=float(seg['segmentBitrateKbps'])
        rebuf=float(seg['segmentStallDurationMs'])/1000.0
        latency=float(seg['currentLatency'])
        play=float(seg['playbackSpeed'])
        buffer=float(seg['currentBufferLength'])
        abs_t=float(seg['currentTimeRelative'])
        
        b.append(bitrate)
        r.append(rebuf)
        l.append(latency)
        p.append(play)
        buf.append(buffer)
        abs_time.append(abs_t)

    mea=np.array(mea)[:,0]
    pre.insert(0,mea[0])
    pre=pre[:-1]
    plot_qoe(mea,pre,real_bw,b,trace,bw)
    plot_buffer(buf,abs_time,l,trace,bw,buffer_error)
    chunk_error=(0.5*np.array(b)*1024/8-np.array(real_chunk))/(np.array(real_chunk)+1e-9)
    plot_error(mea,pre,buffer_error,chunk_error)

    for i in range (len(b)):
        bitrate=b[i]
        rebuf=r[i]
        latency=l[i]
        play=p[i]
        bitrate_qoe+=0.5*bitrate
        rebuf_pen+=bit_max*rebuf
        play_pen+=bit_min*abs(play-1)
        limbo=1.6
        if (trace=="all_0"): 
            lat_pen+=bit_max*abs(latency-1.5)
        else:
            if (latency<limbo): lat_pen+=0.05*bit_min*latency
            else: lat_pen+=0.1*bit_max*latency
        if (i!=0): flu=abs(bitrate-b[i-1])
        else: flu=0
        switch_pen+=0.02*flu
        f.append(flu)
        # print(i,"{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}".format(mea[i][0],pre[i],real_bw[i],bitrate,1000*rebuf,latency,play,flu,qoe))
    qoe=bitrate_qoe-rebuf_pen-lat_pen-play_pen-switch_pen
    return len(b),np.mean(b)/1000.0,np.sum(r)/60*100,np.mean(l),np.mean(p),np.mean(f)/1000.0,qoe,bitrate_qoe,rebuf_pen,lat_pen,play_pen,switch_pen,np.mean(abs(np.array(buffer_error)))

if (mode==0):
    traces=TRACE
for trace in traces:
    # if (trace=="all_0"): continue
    bws=os.listdir(pre_path+trace)
    bws.sort()
    if (mode==0):
        bws=range(total_trace)
        # bws=[40]
    b=[]
    r=[]
    l=[]
    p=[]
    flu=[]
    qoe=[]
    buffer=[]

    b_qoe=[]
    r_pen=[]
    l_pen=[]
    p_pen=[]
    flu_pen=[]

    for bw in tqdm.tqdm(bws):
        bw=str(bw)
        trace_name=pre_path+trace+"/"+str(bw)+"/"+alg+"/"
        f=open(trace_name+"metrics-by-download.json","r")
        segs=json.load(f)
        f.close()
        len1,b1,r1,l1,p1,f1,qoe1,bitrate_qoe1,rebuf_pen1,lat_pen1,play_pen1,switch_pen1,buffer1=gen(segs,trace,bw)
        b.append(b1)
        r.append(r1)
        l.append(l1)
        p.append(p1)
        flu.append(f1)
        qoe.append(qoe1)
        buffer.append(buffer1)

        b_qoe.append(bitrate_qoe1)
        r_pen.append(rebuf_pen1)
        l_pen.append(lat_pen1)
        p_pen.append(play_pen1)
        flu_pen.append(switch_pen1)
        print(trace,bw,"{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f},{:.2f}".format(len1,b1,r1,l1,p1,f1,qoe1,buffer1))
    print("done for",trace,"b,r,l,p,f,qoe: bit: {:.4f}\t,+{:.4f}\t,-{:.4f}\t,rebuf: {:.4f}\t,+{:.4f}\t,-{:.4f}\t,latency: {:.4f}\t,+{:.4f}\t,-{:.4f}\t,play: {:.4f}\t,+{:.4f}\t,-{:.4f}\t,switch: {:.4f}\t,+{:.4f}\t,-{:.4f}\t,qoe: {:.4f}\t,+{:.4f}\t,-{:.4f}\t,{:.4f}\t,{:.4f}\t,{:.4f}\t,{:.4f}\t,{:.4f}\t,{:.4f} \n".format(
        np.mean(b),np.max(b)-np.mean(b),np.min(b)-np.mean(b),np.mean(r),np.max(r)-np.mean(r),np.min(r)-np.mean(r),np.mean(l),np.max(l)-np.mean(l),np.min(l)-np.mean(l),np.mean(p),np.max(p)-np.mean(p),np.min(p)-np.mean(p),np.mean(flu),np.max(flu)-np.mean(flu),np.min(flu)-np.mean(flu),np.mean(qoe),np.max(qoe)-np.mean(qoe),np.min(qoe)-np.mean(qoe),np.mean(b_qoe),np.mean(r_pen),np.mean(l_pen),np.mean(p_pen),np.mean(flu_pen),np.mean(buffer)))
print("all done")