ffmpeg -i bbb.mp4 -c:v libx264 -b:v 4300K -s 1920x1080 -g 15 -keyint_min 15 1080.mp4
ffprobe -show_frames -select_streams v  1080.mp4 | grep -E "key_frame|pkt_size" > ./1080.txt

ffmpeg -i bbb.mp4 -c:v libx264 -b:v 2850K -s 1280x720 -g 15 -keyint_min 15 720.mp4
ffprobe -show_frames -select_streams v  720.mp4 | grep -E "key_frame|pkt_size" > ./720.txt

ffmpeg -i bbb.mp4 -c:v libx264 -b:v 1500K -s 720x480 -g 15 -keyint_min 15 480.mp4
ffprobe -show_frames -select_streams v  480.mp4 | grep -E "key_frame|pkt_size" > ./480.txt

ffmpeg -i bbb.mp4 -c:v libx264 -b:v 600K -s 480x360 -g 15 -keyint_min 15 360.mp4
ffprobe -show_frames -select_streams v  360.mp4 | grep -E "key_frame|pkt_size" > ./360.txt