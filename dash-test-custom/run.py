import os
import sys
import tqdm
import numpy as np
import signal
import subprocess
import time
from const import *
import execjs

mode=int(sys.argv[1])
alg=str(sys.argv[2])

pre_path="./trace/raw/"

def run_mm(i,j,k):
    f=open("./bw_truth/"+i+"/"+j+"/"+alg,'w')
    TRACE = './trace/cooked/'+i+"/"+j

    comm="node run.js "+i+" "+j+" "+k
    start_server = 'mm-delay 20 mm-link '+TRACE+" "+TRACE+" "+comm
    
    proc = subprocess.Popen(start_server, shell=True)
    js_time=execjs.eval("Date.now()")
    cur_time=time.time()
    print(start_server,"\n",cur_time,js_time)
    cur_time=float(js_time)/1000.0
    (out, err) = proc.communicate()
    print("subprocess message" + str(out)+str(err))

    f1=open("./trace/raw/"+i+"/"+j,'r')
    bw_all=f1.readlines()
    f1.close()
    for i in range(len(bw_all)):
        bw=bw_all[i].strip().split(" ")
        for j in range(len(bw)):
            bw[j]=float(bw[j])
        bw_all[i]=bw

    for i in range(len(bw_all)):
        f.write(str(bw_all[i][1])+" "+str(bw_all[i][0]-bw_all[0][0]+float(cur_time))+"\n")
        f.flush()
    f.close()
    return

def run_tc(i,j,k):
    comm="node run.js "+i+" "+j+" "+k
    print(comm)
    proc = subprocess.Popen(comm, shell=True)
    (out, err) = proc.communicate()
    print("subprocess message" + str(out)+str(err))
    os.system("sudo kill $(ps aux | grep trace_run.py | awk '{print $2}') > /dev/null 2>&1")
    return

def run_chrome(i,j,k):
    comm="node run.js "+i+" "+j+" "+k
    print(comm)
    proc = subprocess.Popen(comm, shell=True)
    (out, err) = proc.communicate()
    print("subprocess message" + str(out)+str(err))
    # os.system("sudo kill $(ps aux | grep trace_run.py | awk '{print $2}') > /dev/null 2>&1")
    return

if (mode==0):
    print("in mode 0")
    trace=TRACE
    bw=range(total_trace)
    for i in trace:
        for j in bw:
            run_mm(i,str(j),alg)
else:
    print("in mode 1")
    traces=os.listdir(pre_path)
    traces.sort()
    for i in traces:
        if (i=="all_0"): continue
        bws=os.listdir(pre_path+i)
        bws.sort()
        for j in tqdm.tqdm(bws):
            run_chrome(i,j,alg)
        print("done for",i)
    print("all done")

# os.system("sudo tc qdisc change dev ifb0 handle 1: root tbf rate 800mbit burst 20k latency 54ms")