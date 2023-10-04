import os
import sys
import time
import numpy as np

traces = sys.argv[1]
truth=sys.argv[2]
print(traces,truth)
tmp_truth=truth.split("/")[-1]
tmp_truth=truth.replace(tmp_truth,"")

if (os.path.exists(tmp_truth)==False):
    os.makedirs(tmp_truth)
# exit(0)
interval = 0.5 
sep = " "

f=open(traces,"r")
lines=f.readlines()
f.close()
f=open(truth, 'w')
startbw=float(lines[0].strip().split(" ")[1])
lastbw=startbw
lasttime=0.0
for i in range (1,len(lines)):
    line=lines[i].strip().split(" ")
    curtime=float(line[0])
    if (curtime>=60):
        break
    tosleep=curtime-lasttime

    comm="sudo tc qdisc change dev ifb0 handle 1: root tbf rate "+str(lastbw)+"mbit burst 20k latency 54ms"
    os.system(comm)
    f.write(str(lastbw)+" "+str(time.time())+"\n")
    f.flush()
    # comm="echo "+str(lastbw)+",$(date +%s.%7N) >>"+str(truth)
    # os.system(comm)
    time.sleep(tosleep)
    lastbw=float(line[1])
    lasttime=curtime
f.close()
os.system("sudo tc qdisc change dev ifb0 handle 1: root tbf rate 800mbit burst 20k latency 54ms")