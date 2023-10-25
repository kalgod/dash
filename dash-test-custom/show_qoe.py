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
    SCHEMES=['mea','pre','real','bit']
    labels = SCHEMES
    #outputname="BBA与MPC对比"
    outputname="./results/"+trace+"/"+bw+"/"+alg+"/qoe"
    mea=np.array(mea)[:,0]
    pre.insert(0,0)
    pre=pre[:-1]
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
    plt.ylabel('BW')
    plt.grid()
    plt.xlabel('Time')
    path_tmp=outputname+".pdf"
    savefig(path_tmp)
    plt.close()

def plot_buffer(buf,abs_time,l,trace,bw):
    TEST_LOG_FOLDER = './'
    SCHEMES=['buffer','latency']
    labels = SCHEMES
    #outputname="BBA与MPC对比"
    outputname="./results/"+trace+"/"+bw+"/"+alg+"/buffer"
    results_all=[buf,l]
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

    xs=abs_time
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
    plt.ylabel('BW')
    plt.grid(linestyle='--')
    plt.xlabel('Time')
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
    key_l=list(segs.keys())
    for i in range(len(key_l)):
        key=key_l[i]
        if ("chunk" not in key): continue
        seg=segs[key]
        
        cur_mea=float(seg['throughputhis'])
        cur_pre=float(seg['throughputKbps'])
        start=float(seg['requestInfo']['requestStartDate'])
        end=float(seg['requestInfo']['requestEndDate'])
        # print(i,key,len(key_l),float(seg['requestInfo']['bytesTotal']),cur_mea,cur_pre)
        mea.append([cur_mea,start,end])
        pre.append(cur_pre)
    return mea,pre

def gen(segs,trace,bw):
    bit_max=6000
    bit_min=200
    mea,pre=gen_bw(segs)
    real_bw=comp(mea,pre,trace,bw)
    b=[]
    r=[]
    l=[]
    p=[]
    f=[]
    buf=[]
    abs_time=[]
    qoe=0
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

    plot_qoe(mea,pre,real_bw,b,trace,bw)
    plot_buffer(buf,abs_time,l,trace,bw)

    for i in range (len(b)):
        bitrate=b[i]
        rebuf=r[i]
        latency=l[i]
        play=p[i]
        if (latency<1.6): qoe=qoe+0.5*bitrate-bit_max*rebuf-bit_max*abs(latency-1.5)-bit_min*abs(play-1)
        else: qoe=qoe+0.5*bitrate-bit_max*rebuf-bit_max*abs(latency-1.5)-bit_min*abs(play-1)
        if (i!=0):
            flu=abs(bitrate-b[i-1])
        else:
            flu=0
        qoe-=0.5*flu
        f.append(flu)
        # print(i,"{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}".format(mea[i][0],pre[i],real_bw[i],bitrate,1000*rebuf,latency,play,flu,qoe))
    return len(b),np.mean(b),np.sum(r),np.mean(l),np.mean(p),np.mean(f),qoe

if (mode==0):
    traces=TRACE
for trace in traces:
    # if (trace=="all_0"): continue
    bws=os.listdir(pre_path+trace)
    bws.sort()
    if (mode==0):
        bws=range(total_trace)
    b=[]
    r=[]
    l=[]
    p=[]
    flu=[]
    qoe=[]
    for bw in tqdm.tqdm(bws):
        bw=str(bw)
        trace_name=pre_path+trace+"/"+str(bw)+"/"+alg+"/"
        f=open(trace_name+"metrics-by-download.json","r")
        segs=json.load(f)
        f.close()
        len1,b1,r1,l1,p1,f1,qoe1=gen(segs,trace,bw)
        b.append(b1)
        r.append(r1)
        l.append(l1)
        p.append(p1)
        flu.append(f1)
        qoe.append(qoe1)
        print(trace,bw,"{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}\t,{:.2f}".format(len1,b1,r1,l1,p1,f1,qoe1))
    print("done for",trace,"b,r,l,p,f,qoe: {:.4f}\t,{:.4f}\t,{:.4f}\t,{:.4f}\t,{:.4f}\t,{:.4f} \n".format(np.mean(b),np.mean(r),np.mean(l),np.mean(p),np.mean(flu),np.mean(qoe)))
print("all done")