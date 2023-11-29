import numpy as np
import os
import matplotlib.pyplot as plt
from matplotlib.pyplot import plot, savefig
import matplotlib
from const import *
import tqdm
import json
import sys
import scipy.stats
# from const import *

lines = ['-', '--', '-.', ':', '--', '-', '-.', ':', '--', '-']
#colors = ['red', 'blue', 'orange', 'green', 'black']
def rgb_to_hex(rr, gg, bb):
    rgb = (rr, gg, bb)
    return '#%02x%02x%02x' % rgb
colors = [rgb_to_hex(47, 103, 223), rgb_to_hex(239, 117, 38), rgb_to_hex(
    121, 90, 158), rgb_to_hex(68, 166, 69), rgb_to_hex(34, 34, 34), rgb_to_hex(237, 65, 29), 
    rgb_to_hex(102, 49, 160), rgb_to_hex(255, 192, 0)]
markers = ['o','>','v','^','*','<','s','p','*','h','H','D','d','1']

pre_path="./results/"

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
    chunk_error=(0.5*np.array(b)*1024/8-np.array(real_chunk))/(np.array(real_chunk)+1e-9)

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

def mean_confidence_interval(data, confidence=0.95):
    a = 1.0 * np.array(data)
    n = len(a)
    m, se = np.mean(a), scipy.stats.sem(a)
    h = se * scipy.stats.t.ppf((1 + confidence) / 2., n-1)
    return m, m-h, m+h

def gen_data(dataset,labels,scenes,algs):
    avg=np.zeros((len(labels),len(scenes)))
    error=np.zeros((len(labels),2,len(scenes)))

    for i in range(len(algs)):
        alg=algs[i]
        bws=range(total_trace)
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

        for bw in bws:
            bw=str(bw)
            trace_name=pre_path+dataset+"/"+str(bw)+"/"+alg+"/"
            f=open(trace_name+"metrics-by-download.json","r")
            segs=json.load(f)
            f.close()
            len1,b1,r1,l1,p1,f1,qoe1,bitrate_qoe1,rebuf_pen1,lat_pen1,play_pen1,switch_pen1,buffer1=gen(segs,dataset,bw)
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

        tmp_mean,tmp_min,tmp_max=mean_confidence_interval(qoe)
        avg[i][0]=tmp_mean
        error[i][0][0]=tmp_mean-tmp_min
        error[i][1][0]=tmp_max-tmp_mean

        tmp_mean,tmp_min,tmp_max=mean_confidence_interval(b)
        avg[i][1]=tmp_mean
        error[i][0][1]=tmp_mean-tmp_min
        error[i][1][1]=tmp_max-tmp_mean

        tmp_mean,tmp_min,tmp_max=mean_confidence_interval(r)
        avg[i][2]=tmp_mean
        error[i][0][2]=tmp_mean-tmp_min
        error[i][1][2]=tmp_max-tmp_mean

        tmp_mean,tmp_min,tmp_max=mean_confidence_interval(l)
        avg[i][3]=tmp_mean
        error[i][0][3]=tmp_mean-tmp_min
        error[i][1][3]=tmp_max-tmp_mean

        tmp_mean,tmp_min,tmp_max=mean_confidence_interval(p)
        avg[i][4]=tmp_mean
        error[i][0][4]=tmp_mean-tmp_min
        error[i][1][4]=tmp_max-tmp_mean

        tmp_mean,tmp_min,tmp_max=mean_confidence_interval(flu)
        avg[i][5]=tmp_mean
        error[i][0][5]=tmp_mean-tmp_min
        error[i][1][5]=tmp_max-tmp_mean

    print(dataset,avg[:,0])
    qoe_min=np.min(avg[:,0])
    avg[:,0]/=qoe_min
    error[:,:,0]/=qoe_min
    print(dataset,avg[:,0],avg[0,0]-avg[2,0],"\n")
    return avg,error
        

def plot_bar(name,avg,error,labels,scenes):
    plt.rc('axes', axisbelow=True)
    fig = plt.figure(figsize=(10,3), constrained_layout=True)
    axs = fig.subplots(1, 1)
    # labels=["Fusion","Fleet","Moof+","Moof","AAST","Seg","Default"]
    width=0.3
    x = np.array([1.2*width*len(labels) * i for i in range(len(scenes))])
    
    for i in range (len(labels)):
        axs.bar(x +(i-int(len(labels)/2)) * width, avg[i], width, error_kw={'lw': 1, 'capsize': 3},
            yerr=[error[i][0],error[i][1]], label=labels[i], alpha=0.5, lw=2)
        
    box = axs.get_position()
    axs.set_position([box.x0, box.y0, box.width * 1, box.height * 0.80])
    # plt.legend(loc='upper center', bbox_to_anchor=(0.5, 1.4), ncol=len(labels),fontsize=15)

    axs.set_xticks(x)
    axs.set_ylabel('Normalized Value', fontsize=15)

    plt.tick_params(labelsize=15)
    plt.grid()
    if ("fcc" in name or "oboe" in name):
        plt.ylim(0.0, 3.0)
        plt.yticks([0, 1,1.5, 2, 3])
    elif ("norway" in name):
        plt.ylim(0.0, 2.0)
        plt.yticks([0, 1,1.5, 2])
    else:
        plt.ylim(0.0, 5.0)
        plt.yticks([0, 1,1.5, 2,3,4,5])
    # plt.tight_layout()
    axs.set_xticklabels(scenes)
    # for i in axs.get_xticklabels()[:]:
    #    i.set_rotation(5)
    #    i.set_horizontalalignment('right')
    plt.savefig("./figs/"+name+".pdf")
    print("Done")

def main():
    labels=["AAR","Pensieve","LoL+","L2ALL","STALLION","Dynamic","RB"]
    scenes=["QoE","Bitrates","Rebuffer","Latency","Speed","Switches"]
    algs=["fusion-slide-smpc","fusion-slide-pensieve","fusion-slide-lolp","fusion-slide-l2all","fusion-slide-stallion","fusion-slide-dyn","fusion-slide-rb"]
    # algs=["fleet-slide-smpc","fleet-slide-pensieve","fleet-slide-lolp","fleet-slide-l2all","fleet-slide-stallion","fleet-slide-dyn","fleet-slide-rb"]
    datasets=TRACE
    for i in range (len(datasets)):
        dataset=datasets[i]
        avg,error=gen_data(dataset,labels,scenes,algs)
        plot_bar("qoe_"+str(dataset),avg,error,labels,scenes)

main()