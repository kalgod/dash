# python3 run.py 0 fusion-slide-lolp
# python3 show_bw.py 0 fusion-slide-lolp >temp1.txt
# python3 show_qoe.py 0 fusion-slide-lolp >>temp1.txt

# python3 run.py 0 moof-slide-lolp
# python3 show_bw.py 0 moof-slide-lolp >temp2.txt
# python3 show_qoe.py 0 moof-slide-lolp >>temp2.txt

python3 run.py 0 fusion-slide-rmpc
python3 show_bw.py 0 fusion-slide-rmpc >temp3.txt
python3 show_qoe.py 0 fusion-slide-rmpc >>temp3.txt

python3 run.py 0 moof-slide-rmpc
python3 show_bw.py 0 moof-slide-rmpc >temp4.txt
python3 show_qoe.py 0 moof-slide-rmpc >>temp4.txt