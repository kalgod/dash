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
    return np.mean(res),np.mean(res1),np.mean(real_all)

if (mode==0):
    traces=TRACE
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
        bw_all.append(real_bw)
        # print(segs,segs.keys())
        print(trace,bw,cha,cha1)
    print("done for",trace)
    if (len(cha_all)!=0): print("mea and pre and bw: ",100*np.mean(cha_all),100*np.mean(cha1_all),np.mean(bw_all))
print("all done")