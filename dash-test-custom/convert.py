import os
import numpy as np
import argparse
import tqdm


FILE_SIZE = 0
MBPS_PER_PKTMS = (1024*1024/8)/(1500*1000) #每个包1ms内下载完成需要的带宽是1500B/ms，已有带宽是Mbps，所以包个数单位就是(1000*1000/8)/(1500*1000)=1000/(8*1500)=1/12


def main(args):
    files = os.listdir(args.in_dir)
    files.sort()
    for trace_file in tqdm.tqdm(files):
        # if trace_file!='10062': continue
        if os.stat(os.path.join(args.in_dir, trace_file)).st_size >= FILE_SIZE:
            #print((os.path.join(args.in_dir, trace_file)))
            with open(os.path.join(args.in_dir, trace_file), 'rb') as f, open(os.path.join(args.out_dir, trace_file), 'wb') as mf:
                lines=f.readlines()
                # mf.write(bytes(str(ms_cur) + '\n', encoding='utf-8'))
                remain_pkt = 0
                for i in range(len(lines)-1):
                    line=lines[i]
                    ms1=int(float(line.split()[0])*1000)
                    throughput = float(line.split()[1])
                    line=lines[i+1]
                    ms2=int(float(line.split()[0])*1000)
                    # print(ms1,ms2,throughput)
                    while ms1 < ms2:
                        remain_pkt += throughput*MBPS_PER_PKTMS
                        #print("remain",remain_pkt)
                        while remain_pkt > 1:
                            mf.write(bytes(str(ms1+1) +
                                     '\n', encoding='utf-8'))
                            remain_pkt -= 1
                        ms1 += 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('-i', '--in-dir')
    parser.add_argument('-o', '--out-dir')
    args = parser.parse_args()
    main(args)
