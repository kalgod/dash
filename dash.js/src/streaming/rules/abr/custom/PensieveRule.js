/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
var PensieveRule;

function PensieveRuleClass(config) {
    const future_seg = 4;
    const single_chunk = 1 / 30;
    const bw_len = 5;
    const err_len = 5;
    const buffer_err_len = 5;
    const S_INFO = 6, S_LEN = 8;
    const VIDEO_BIT_RATE = [200, 600, 1000, 2500, 4000, 6000];
    config = config || {};
    let context = this.context;
    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let StreamController = factory.getSingletonFactoryByName('StreamController');
    let last_state = [0, 0, 0];
    let last_abr = -1;
    let start_flag = 1;
    let bw_arr = [];
    let bw_err = [];
    let future_bw = -1;
    let diff_all = [];
    let diff_arr = [];
    const dashMetrics = config.dashMetrics;
    const ort = config.ort;

    let pensieveState = [];
    for (let i = 0; i < S_INFO; i++) {
        pensieveState.push(Array(S_LEN).fill(0.0));
    }
    // console.log(window.location.pathname);
    // console.log(ort, pensieveSession, pensieveState)

    let instance;

    function setup() {
        return;
    }

    function cal_future(past_bw) {
        if (!past_bw) return NaN;
        let harmonic_bandwidth = 0;
        let last_bw = past_bw[past_bw.length - 1];
        bw_arr.push(last_bw);
        if (bw_arr.length > bw_len) bw_arr.shift();
        let i = 0;
        for (i = 0; i < bw_arr.length; i++) harmonic_bandwidth += 1.0 / (bw_arr[i] + 1e-9);
        harmonic_bandwidth = bw_arr.length / (harmonic_bandwidth + 1e-9);

        let current_err = 0;
        if (future_bw != -1) {
            current_err = Math.abs(future_bw - last_bw) / (last_bw + 1e-9);
        }
        bw_err.push(current_err);
        if (bw_err.length > err_len) bw_err.shift();

        let discount1 = 1.0 / (1.0 + Math.max(...bw_err));
        let discount2 = 1.0 / (1.0 + diff_arr[3]);
        let alpha = 1;

        // let discount=Math.min(discount1,discount2);
        let discount = alpha * discount1 + (1 - alpha) * discount2;

        future_bw = harmonic_bandwidth * discount;
        console.log(last_bw, future_bw, discount1, discount2)
        // console.log(bw_arr, bw_err, harmonic_bandwidth, discount, future_bw);
        // return harmonic_bandwidth * discount;
        return harmonic_bandwidth;
    }
    function argmax(arr) {
        let maxIndex = 0;
        let maxValue = arr[0];
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] > maxValue) {
                maxValue = arr[i];
                maxIndex = i;
            }
        }
        return maxIndex;
    }

    async function handle(last_bit, buffer, bw, downtime, next_chunk, cur_chunk) {
        const pensieveSession = await ort.InferenceSession.create('./model.onnx');
        // Roll
        for (let i = 0; i < S_INFO; i++) {
            pensieveState[i].push(pensieveState[i].shift());
        }
        // Set value
        pensieveState[0][S_LEN - 1] = VIDEO_BIT_RATE[last_bit] / Math.max(...VIDEO_BIT_RATE);
        pensieveState[1][S_LEN - 1] = buffer / 2.0;
        pensieveState[2][S_LEN - 1] = bw / 8000;
        pensieveState[3][S_LEN - 1] = downtime / 2.0;
        for (let i = 0; i < next_chunk.length; i++) {
            pensieveState[4][i] = next_chunk[i] * 0.5 / 8000;
        }
        pensieveState[5][S_LEN - 1] = cur_chunk / 1000 / 1000;


        // Prepare
        let dataArray = Float32Array.from([].concat(...pensieveState));
        let dataTensor = new ort.Tensor('float32', dataArray, [1, S_INFO, S_LEN]);
        let feeds = { input1: dataTensor }

        console.log("in pensieve", pensieveState, dataTensor)
        // Run
        let result = await pensieveSession.run(feeds);
        // let probability = result.probability.data;

        let bitrate = argmax(result.output1.data);
        console.log('[pensieve] probability:', result.output1.data, bitrate);

        // 5. return
        return bitrate;
    }

    function cal_diff(last_state, cur_state) {
        let i = 0;
        let diff = [];
        let idx = 3;
        for (i = 0; i < last_state.length; i++) {
            diff.push((last_state[i] - cur_state[i]));
        }
        diff_all.push(diff[idx]);
        if (diff_all.length > buffer_err_len) diff_all.shift();
        let diff_max = Math.max(...diff_all);
        let diff_avg = diff_all.reduce((acc, curr) => acc + curr, 0) / diff_all.length;
        let diff_abs_avg = diff_all.reduce((acc, curr) => acc + Math.abs(curr), 0) / diff_all.length;
        let diff_abs = Math.max(...diff_all.map(n => Math.abs(n)));
        // console.log("diff abs", diff_all, diff_abs, diff_abs_avg);

        let diff_var = diff_all.reduce((total, num) => {
            let ttmp = num - diff_avg;
            return total + ttmp * ttmp;
        }, 0) / diff_all.length;

        diff_var = Math.sqrt(diff_var);

        // diff_abs = (Math.random() * 2 - 1) * diff_var + diff_avg;
        // diff_abs = Math.max(diff_abs, Math.min(...diff_all))
        // diff_abs = Math.min(diff_abs, Math.max(...diff_all))
        // diff_abs = Math.abs(diff_abs)

        diff_arr = [(last_state[0] - cur_state[0]) / (cur_state[0] + 1e-9), diff_avg, diff_var, diff_max, diff_abs_avg, diff_abs];
        // console.log(diff_arr);
        return diff_arr;
    }

    function getMaxIndex(rulesContext) {
        try {
            let cur_abr = Date.now() / 1000;
            if (last_abr == -1) last_abr = cur_abr;

            let metricsModel = MetricsModel(context).getInstance();
            var mediaType = rulesContext.getMediaInfo().type;
            var metrics = metricsModel.getMetricsFor(mediaType, true);

            // A smarter (real) rule could need analyze playback metrics to take
            // bitrate switching decision. Printing metrics here as a reference
            // console.log(metrics);

            // Get current bitrate
            let streamController = StreamController(context).getInstance();
            let abrController = rulesContext.getAbrController();
            // let current = abrController.getQualityFor(mediaType, streamController.getActiveStreamInfo().id);

            let switchRequest = SwitchRequest(context).create();
            const scheduleController = rulesContext.getScheduleController();
            const playbackController = scheduleController.getPlaybackController();
            let latency = playbackController.getCurrentLiveLatency();
            let targetLiveDelay = playbackController.getLiveDelay();
            const streamInfo = rulesContext.getStreamInfo();
            const streamId = streamInfo ? streamInfo.id : null;
            let currentQuality = abrController.getQualityFor(mediaType, streamId);
            const mediaInfo = rulesContext.getMediaInfo();

            // let dashMetrics = factory.getClassFactoryByName('DashMetrics');
            // console.log(config, dashMetrics);

            const bufferStateVO = dashMetrics.getCurrentBufferState(mediaType);
            let currentBufferLevel = dashMetrics.getCurrentBufferInfo(mediaType, true);
            const isDynamic = streamInfo && streamInfo.manifestInfo ? streamInfo.manifestInfo.isDynamic : null;

            if (!latency) {
                latency = 0;
            }

            let playbackRate = playbackController.getPlaybackRate();
            const throughputHistory = abrController.getThroughputHistory();
            let past_bw = throughputHistory.getDict()[mediaType]
            // console.log(past_bw, mediaType);

            // QoE parameters
            let bitrateList = mediaInfo.bitrateList;  // [{bandwidth: 200000, width: 640, height: 360}, ...]
            let next_bit = [];
            let segmentDuration = rulesContext.getRepresentationInfo().fragmentDuration;
            let minBitrateKbps = bitrateList[0].bandwidth / 1000.0;                         // min bitrate level
            let maxBitrateKbps = bitrateList[bitrateList.length - 1].bandwidth / 1000.0;    // max bitrate level
            for (let i = 0; i < bitrateList.length; i++) {  // in case bitrateList is not sorted as expected
                let b = bitrateList[i].bandwidth / 1000.0;
                next_bit.push(b);
            }

            // Learning rule pre-calculations
            let currentBitrate = bitrateList[currentQuality].bandwidth / 1000.0;
            let httpRequest = dashMetrics.getCurrentHttpRequest(mediaType, true);
            let lastFragmentDownloadTime = (httpRequest.tresponse.getTime() - httpRequest.trequest.getTime()) / 1000;
            let segmentRebufferTime = lastFragmentDownloadTime > segmentDuration ? lastFragmentDownloadTime - segmentDuration : 0;

            let interval = httpRequest.interval;
            let chunks = httpRequest.chunks;
            let flag = httpRequest._responseHeaders.replace("\r", "").replace("\n", "")
            flag = flag.split(":")[1]
            flag = parseInt(flag, 10)

            let next_chunks = [];
            let tmp_sum = chunks.reduce((a, b) => a + b.bytes, 0);
            for (let i = 0; i < next_bit.length; i++) {
                let j = 0;
                let tmp_chunks = []
                for (j = 0; j < chunks.length; j++) {
                    tmp_chunks.push(0.5 * next_bit[i] * 1024 / 8 * chunks[j].bytes / tmp_sum);
                }
                next_chunks.push(tmp_chunks);
            }
            /*
             * Select next quality
             */
            if (last_state[0] == 0 && last_state[1] == 0) {
                last_state = [currentBufferLevel[1], latency, playbackRate, cur_abr - last_abr];
            }
            let cur_state = [currentBufferLevel[1], latency, playbackRate, cur_abr - last_abr];

            console.log(last_state, cur_state);
            diff_arr = cal_diff(last_state, cur_state);
            throughputHistory.addBuffer(diff_arr[0]);

            let current_err = 0;
            let last_bw = -1;
            if (future_bw != -1 && past_bw) {
                last_bw = past_bw[past_bw.length - 1];
                current_err = (future_bw - last_bw) / (last_bw + 1e-9);
            }

            let throughput = cal_future(past_bw);
            // throughput = throughput * discount_server
            // console.log(past_bw, `Throughput ${Math.round(throughput)} kbps`);
            if (isNaN(throughput) || !bufferStateVO) {
                return switchRequest;
            }



            console.log("start xhr", Date.now(), ort)

            let pensieve_bit = 0;
            xhr = new XMLHttpRequest();
            REMOTE_SIMPLE_URL = 'http://localhost:12300'
            xhr.open("POST", REMOTE_SIMPLE_URL, false);
            xhr.onreadystatechange = function () {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    // console.log("GOT RESPONSE:" + xhr.responseText + "---");
                    if (xhr.responseText != "REFRESH") {
                        pensieve_bit = parseFloat(xhr.responseText);
                        console.log("quality here", pensieve_bit);
                    } else {
                        document.location.reload(true);
                    }
                }
            };
            // console.log(xhr);
            data = { 'last_abr': start_flag, 'last_bit': currentQuality, 'buffer': currentBufferLevel[1], "bw": throughput, "downtime": cur_abr - last_abr, "next_chunk": next_bit, "cur_chunk": tmp_sum };
            xhr.send(JSON.stringify(data));

            console.log("in pensieve1", Date.now(), currentQuality, data, last_abr, cur_abr)

            // console.log("cal jiange, in pensieve, sum: ", diff_arr, current_err, cur_state, currentQuality, currentBitrate, throughput);
            // let mpc_start = Date.now();
            // let next_q = decision(1, chunks, next_chunks, currentBitrate, currentBufferLevel[1], throughput, latency, targetLiveDelay, playbackRate, next_bit, flag);
            // let mpc_end = Date.now();
            // console.log("running time/ms: ", mpc_end - mpc_start, next_q);
            // let pensieve_bit = await handle(currentQuality, currentBufferLevel[1], throughput, cur_abr - last_abr, next_bit, tmp_sum);

            start_flag = 0;
            // let tmp_state = evolve(currentBufferLevel[1], latency, targetLiveDelay, playbackRate, next_q.bit, throughput, chunks, next_chunks, flag, next_bit[next_q.bit] != currentBitrate, false, false);
            // last_state = [tmp_state.next_buf, tmp_state.next_latency, tmp_state.next_play, tmp_state.downtime];
            // console.log(next_q.state, last_state);

            last_abr = cur_abr;
            let tmp_rb = abrController.getQualityForBitrate(mediaInfo, throughput, streamId, latency);
            pensieve_bit = Math.min(pensieve_bit, tmp_rb);

            switchRequest.quality = pensieve_bit;
            console.log("in pensieve 2", switchRequest.quality, tmp_rb);
            switchRequest.reason = { throughput: throughput, latency: latency };
            switchRequest.priority = SwitchRequest.PRIORITY.STRONG;

            scheduleController.setTimeToLoadDelay(0);

            if (switchRequest.quality !== currentQuality) {
                console.log('[PensieveRule][' + mediaType + '] requesting switch to index: ', switchRequest.quality, 'Average throughput', Math.round(throughput), 'kbps');
            }



            return switchRequest;
        } catch (e) {
            throw e;
        }
    }

    instance = {
        getMaxIndex,
    };

    setup();

    return instance;
}

PensieveRuleClass.__dashjs_factory_name = 'PensieveRule';
PensieveRule = dashjs.FactoryMaker.getClassFactory(PensieveRuleClass);