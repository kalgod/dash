#!/bin/bash
parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
cd "$parent_path"

bash ./gen_live_ingest.sh 166.111.138.128 9001 ./ffmpeg ${1}