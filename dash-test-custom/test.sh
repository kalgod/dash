# alg=fusion-slide-l2all
python3 run.py 0 fusion-slide-l2all
python3 show_bw.py 0 fusion-slide-l2all >temp1.txt
python3 show_qoe.py 0 fusion-slide-l2all >>temp1.txt

python3 run.py 0 fleet-slide-l2all
python3 show_bw.py 0 fleet-slide-l2all >temp2.txt
python3 show_qoe.py 0 fleet-slide-l2all >>temp2.txt

python3 run.py 0 moof-slide-l2all
python3 show_bw.py 0 moof-slide-l2all >temp3.txt
python3 show_qoe.py 0 moof-slide-l2all >>temp3.txt

python3 run.py 0 fusion-slide-rmpc
python3 show_bw.py 0 fusion-slide-rmpc >temp4.txt
python3 show_qoe.py 0 fusion-slide-rmpc >>temp4.txt

python3 run.py 0 fleet-slide-rmpc
python3 show_bw.py 0 fleet-slide-rmpc >temp5.txt
python3 show_qoe.py 0 fleet-slide-rmpc >>temp5.txt

python3 run.py 0 moof-slide-rmpc
python3 show_bw.py 0 moof-slide-rmpc >temp6.txt
python3 show_qoe.py 0 moof-slide-rmpc >>temp6.txt

python3 run.py 0 fusion-slide-lolp
python3 show_bw.py 0 fusion-slide-lolp >temp7.txt
python3 show_qoe.py 0 fusion-slide-lolp >>temp7.txt

python3 run.py 0 fleet-slide-lolp
python3 show_bw.py 0 fleet-slide-lolp >temp8.txt
python3 show_qoe.py 0 fleet-slide-lolp >>temp8.txt

python3 run.py 0 moof-slide-lolp
python3 show_bw.py 0 moof-slide-lolp >temp9.txt
python3 show_qoe.py 0 moof-slide-lolp >>temp9.txt





