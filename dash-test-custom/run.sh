#!/bin/bash
# sudo sysctl -w net.ipv4.ip_forward=1
#bash setup.sh
server_ip=172.31.51.127
# run for all traces and algos
for trace_file in ./my_trace/train_2
    do
        echo "replaying with trace file ${trace_file}" # in format of ../cooked_traces/5g....
        filename=$(basename ${trace_file})
        echo "replaying with trace file ${filename}" # in format of 5g_driving...
        
        bash trace_run.sh ${trace_file} > ./bw_truth/bw_bb_${filename} &
        BACK_PID=$!
        echo "$BACK_PID"
        # cd ../dash-test-custom
        # npm run test
        # cd ../exp
        # python3 run.py
        echo "done playing"
        sudo kill ${BACK_PID} > /dev/null 2>&1
        sudo kill $(ps aux | grep trace_run | awk '{print $2}') > /dev/null 2>&1
        
    done

#mv results/* results_walking/
echo "All Done"