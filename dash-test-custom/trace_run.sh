#!/usr/bin/env bash
# @author: Arvind Narayanan

# throughput file in mbits
traces=$1

# interval to change the traces by (in seconds)
interval=0.5

# separator
sep=" "
# echo "$\n"

while IFS=$sep read -r timestamp fiveg remainder
do
  sleep $interval"s" &
  # echo "1[$sep]  2[$timestamp]  3[$fiveg]  4[$remainder]" >>temp.txt
  # change bandwidth 
  y1=$(awk "BEGIN {print $fiveg+0.00001; exit}")
  sudo tc qdisc change dev ifb0 handle 1: root tbf rate $y1"mbit" burst 20k latency 54ms

  # calculate delay
  echo "$fiveg,$(date +%s.%7N) \n" 

  wait
done < $traces

sudo tc qdisc change dev ifb0 handle 1: root tbf rate 800mbit burst 20k latency 54ms
# echo "revert bw"
# echo "Complete./"
