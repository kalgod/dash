#!/bin/bash
parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
cd "$parent_path"

python3 dash_server.py -a 101.6.41.183 -l 'DEBUG' -p 9001 media