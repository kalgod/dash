import numpy as np
import os
import matplotlib.pyplot as plt
from matplotlib.pyplot import plot, savefig
import matplotlib
import scipy.stats
from const import *

debug=["116",'208','241','680','30206','7015',"11061",'11880','10968','10062','10256','10385','10796','12496','12454','19062','30995','14384']

def draw(results_all):
    SCHEMES = ['bw_p', 'bw_r']
    labels = SCHEMES
    # draw cdfs
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

    # colors = [rgb_to_hex(237, 65, 29), rgb_to_hex(102, 49, 160), rgb_to_hex(
    #     255, 192, 0), rgb_to_hex(237, 65, 29), rgb_to_hex(0, 212, 97)]
    colors = [rgb_to_hex(47, 103, 223), rgb_to_hex(239, 117, 38), rgb_to_hex(
        121, 90, 158), rgb_to_hex(68, 166, 69), rgb_to_hex(34, 34, 34), rgb_to_hex(237, 65, 29), 
        rgb_to_hex(102, 49, 160), rgb_to_hex(255, 192, 0)]
    markers = ['o','>','v','^','*','<','s','p','*','h','H','D','d','1']

    for (scheme, label, marker, color, line) in zip(results_all, labels, markers, colors, lines):
        xs=[]
        for i in range (total_len): xs.append(0.25*i)
        ax.plot(xs, scheme, color=color, lw=1.3, 
            markevery = 1250, markersize = 12, marker = marker, markerfacecolor='white',
            label=label)

    ax.legend(framealpha=1, loc='upper left',
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
    path_tmp="./bw/bw_figs/"+TRACE+"/"+test_log_file+".pdf"
    savefig(path_tmp)
    plt.close()

TEST_LOG_FOLDER = './bw/bw_log/'+TRACE+"/"
if TRACE=="test_0":
    TEST_LOG_FOLDER1 = './trace/raw/all_0/'
elif TRACE=="test_1":
    TEST_LOG_FOLDER1 = './trace/raw/all_1/'
else:
    TEST_LOG_FOLDER1 = './trace/raw/'+TRACE+"/"
# TEST_LOG_FOLDER = './bw_test/'
# TEST_LOG_FOLDER1 = './traces/'
test_log_files = os.listdir(TEST_LOG_FOLDER)
test_log_files.sort()
res_all=[]
for i in range(len(test_log_files)):
    test_log_file=test_log_files[i]
    if (".npy" in test_log_file): continue
    bw_p=[]
    bw_r=[]
    with open(TEST_LOG_FOLDER + test_log_file, 'r') as f:
        for line in f:
            bw_p.append(float(line))
    with open(TEST_LOG_FOLDER1 + test_log_file, 'r') as f:
        for line in f:
            parse = line.split()
            bw_r.append(float(parse[1]))

    total_len=min(len(bw_p),len(bw_r))
    bw_p=np.array(bw_p[:total_len])
    bw_r=np.array(bw_r[:total_len])
    if (total_len==0): continue

    # if (test_log_file in debug):
    #     for j in range (len(bw_p)):
    #         print(j,bw_p[j],bw_r[j],abs(bw_p[j]-bw_r[j])/(bw_r[j]+1e-9))
    # if (test_log_file=="101"):
    #     print(bw_p[117],bw_r[117],len(bw_r),len(bw_r))
    res=np.mean(abs(bw_p-bw_r)/(bw_r+1e-9))
    res_all.append(res)
    print(i,test_log_file,total_len,res,bw_p[:3],bw_r[:3])

    results_all=[]
    results_all.append(bw_p)
    results_all.append(bw_r)
    if (test_log_file in debug): draw(results_all)
    
print("Summary: ",len(res_all),np.mean(res_all),np.std(res_all),np.max(res_all),np.min(res_all))