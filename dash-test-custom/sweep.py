import os
import sys
import tqdm
import numpy as np
import signal
import subprocess
import time

# meas=["fusion","fleet","imoof","moof","down","aast","seg"]
# pres=["slide","ewma"]
# algs=["l2all","rb","lolp"]

meas=["fusion","imoof"]
pres=["slide"]
algs=["rmpc","rb"]

for mea in meas:
    for pre in pres:
        for alg in algs:
            cur=mea+"-"+pre+"-"+alg
            comm="python3 run.py 0 "+cur
            proc=subprocess.Popen(comm, shell=True)
            (out, err) = proc.communicate()

            comm="python3 show_bw.py 0 "+cur+" >"+cur+".txt"
            proc=subprocess.Popen(comm, shell=True)
            (out, err) = proc.communicate()

            comm="python3 show_qoe.py 0 "+cur+" >>"+cur+".txt"
            proc=subprocess.Popen(comm, shell=True)
            (out, err) = proc.communicate()
    