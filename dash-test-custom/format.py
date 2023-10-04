import os
import tqdm
import numpy as np
import copy

pre_path="./trace/raw/"
traces=os.listdir(pre_path)
traces.sort()
for trace in traces:
    # if (trace!="all_0"): continue
    bws=os.listdir(pre_path+trace)
    bws.sort()
    for bw in tqdm.tqdm(bws):
        all_bw=[]
        trace_name=pre_path+trace+"/"+bw
        with open(trace_name,"r") as f:
            tmp_bw=f.readlines()
        f.close()
        # print(trace_name,len(tmp_bw),tmp_bw[0])
        for i in range (len(tmp_bw)):
            cur_bw=tmp_bw[i]
            cur_bw=cur_bw.strip().split("\t")
            if (trace=="oboe"):
                cur_bw[0]=float(cur_bw[0])/1000.0
            else:
                cur_bw[0]=float(cur_bw[0])
            cur_bw[1]=float(cur_bw[1])
            if (i==0 and cur_bw[0]!=0):
                tmp_0=copy.deepcopy(cur_bw)
                tmp_0[0]=0
                all_bw.append(tmp_0)
            all_bw.append(cur_bw)

        # for i in range(len(all_bw)):
        #     cur_bw=all_bw[i]
        #     cur_bw[0]+=2
        # all_bw.insert(0,[0.0,50.0])
        # print(trace_name,len(all_bw),all_bw[:2])
        # total_len=min(120,len(all_bw))
        f=open(trace_name,"w")
        lasttime=all_bw[0][0]
        for i in range (len(all_bw)):
            cur_bw=all_bw[i]
            # f.write(str(cur_bw[0])+" "+str(cur_bw[1])+"\n")
            # continue
            if (cur_bw[0]-lasttime>=0.5 or i==0):
                f.write(str(cur_bw[0])+" "+str(cur_bw[1])+"\n")
                lasttime=cur_bw[0]
        # exit(0)
    print("done for",trace)
print("all done")