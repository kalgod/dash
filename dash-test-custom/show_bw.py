import os
import tqdm
import numpy as np
import json
import sys
from const import *
import matplotlib.pyplot as plt
from matplotlib.pyplot import plot, savefig
import matplotlib

mode=int(sys.argv[1])
alg=str(sys.argv[2])

pre_path="./results/"
traces=os.listdir(pre_path)
traces.sort()

def gen(segs):
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

    res1=[]
    real_all=real_all[1:]
    pre=pre[:-1]
    for i in range (len(real_all)):
        cur_pre=pre[i]
        cur_real=real_all[i]
        cha=abs(cur_pre-cur_real)/(cur_real+1e-9)
        # print(i,cur_pre,cur_real,cha)
        if (cur_real!=0): res1.append(cha)
    # print("pre diff: ",truth,len(res1),np.mean(res1),np.std(res1),np.max(res1),np.min(res1))
    return np.mean(res),np.mean(res1),real_all

def plot_cdf(data):
    labels=["FCC","Oboe","3G/HSDPA","Online"]
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
    for (scheme, label, marker, color, line) in zip(data, labels, markers, colors, lines):
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
    plt.xlabel("Bandwidth/Kbps")
    savefig("./figs/dataset.pdf")


if (mode==0):
    traces=TRACE
data=[]
for trace in traces:
    # if (trace=="all_0"): continue
    bws=os.listdir(pre_path+trace)
    bws.sort()
    if (mode==0):
        bws=range(total_trace)
    cha_all=[]
    cha1_all=[]
    bw_all=[]
    
    for bw in tqdm.tqdm(bws):
        bw=str(bw)
        trace_name=pre_path+trace+"/"+str(bw)+"/"+alg+"/"
        f=open(trace_name+"metrics-by-download.json","r")
        segs=json.load(f)
        f.close()
        mea,pre=gen(segs)
        cha,cha1,real_bw=comp(mea,pre,trace,bw)
        # print(100*cha,100*cha1)
        cha_all.append(cha)
        cha1_all.append(cha1)
        bw_all.extend(real_bw)
        # print(segs,segs.keys())
        # print(trace,bw,cha,cha1)
    print("done for",trace)
    data.append(bw_all)
    if (len(cha_all)!=0): print("mea and pre and bw: ",100*np.mean(cha_all),100*np.mean(cha1_all),np.mean(bw_all))
plot_cdf(data)
print("all done")