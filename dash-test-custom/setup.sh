#!/usr/bin/env bash
# @author: Arvind Narayanan

interface="eno1"
latency=54

bash clean.sh

sleep 1

# Setup
sudo ip link set dev $interface up
sudo modprobe ifb numifbs=2
sudo ip link set dev ifb0 up
# sudo ip link set dev ifb1 up
echo "Setup"

sleep 2

# REDIRECT INGRESS eth0 -> ifb0
sudo tc qdisc add dev $interface handle ffff: ingress
sudo tc filter add dev $interface parent ffff: protocol all u32 match u32 0 0 action mirred egress redirect dev ifb0
echo "Filters setup."

# 5G - INGRESS RULES ifb0 -> host
sudo tc qdisc add dev ifb0 handle 1: root tbf rate 800mbit burst 20k latency $latency"ms"
echo "5G Latency: $latency"
