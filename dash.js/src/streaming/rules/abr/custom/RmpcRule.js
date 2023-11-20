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
var RmpcRule;
const future_seg = 4;
const single_chunk = 1 / 30;
const bw_len = 5;
const err_len = 5;
const buffer_err_len = 5;

function RmpcRuleClass(config) {
    config = config || {};
    let context = this.context;
    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let StreamController = factory.getSingletonFactoryByName('StreamController');
    let last_state = [0, 0, 0];
    let bw_arr = [];
    let bw_err = [];
    let future_bw = -1;
    let diff_all = [];
    const dashMetrics = config.dashMetrics;

    let instance;

    function setup() {
        return;
    }

    function cal_future(past_bw, diff_arr) {
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
        let alpha = 0;

        // let discount=Math.min(discount1,discount2);
        let discount = alpha * discount1 + (1 - alpha) * discount2;

        future_bw = harmonic_bandwidth * discount;
        console.log(discount1, discount2)
        // console.log(bw_arr, bw_err, harmonic_bandwidth, discount, future_bw);
        // return harmonic_bandwidth * discount;
        return harmonic_bandwidth * discount;
    }

    function playbackrate_change(currentPlaybackRate, currentLiveLatency, liveDelay, bufferLevel) {
        let liveCatchUpPlaybackRates = { min: -0.3, max: 0.3 };
        let playbackBufferMin = 0.5;
        let newRate;
        // Hybrid: Buffer-based
        if (bufferLevel < playbackBufferMin) {
            // Buffer in danger, slow down
            const cpr = Math.abs(liveCatchUpPlaybackRates.min); // Absolute value as negative delta value will be used.
            const deltaBuffer = bufferLevel - playbackBufferMin; // -ve value
            const d = deltaBuffer * 5;

            // Playback rate must be between (1 - cpr) - (1 + cpr)
            // ex: if cpr is 0.5, it can have values between 0.5 - 1.5
            const s = (cpr * 2) / (1 + Math.pow(Math.E, -d));
            newRate = (1 - cpr) + s;

            // logger.debug('[LoL+ playback control_buffer-based] bufferLevel: ' + bufferLevel + ', newRate: ' + newRate);
        } else {
            // Hybrid: Latency-based
            // Buffer is safe, vary playback rate based on latency
            const cpr = liveCatchUpPlaybackRates.max;
            // Check if latency is within range of target latency
            const minDifference = 0.02;
            if (Math.abs(currentLiveLatency - liveDelay) <= (minDifference * liveDelay)) {
                newRate = 1;
            } else {
                const deltaLatency = currentLiveLatency - liveDelay;
                const d = deltaLatency * 5;

                // Playback rate must be between (1 - cpr) - (1 + cpr)
                // ex: if cpr is 0.5, it can have values between 0.5 - 1.5
                const s = (cpr * 2) / (1 + Math.pow(Math.E, -d));
                newRate = (1 - cpr) + s;
            }

            // logger.debug('[LoL+ playback control_latency-based] latency: ' + currentLiveLatency + ', newRate: ' + newRate);
        }
        const minPlaybackRateChange = 0.02 / (0.5 / liveCatchUpPlaybackRates.max);
        // Obtain newRate and apply to video model.  Don't change playbackrate for small variations (don't overload element with playbackrate changes)
        if (newRate && Math.abs(currentPlaybackRate - newRate) >= minPlaybackRateChange) { // non-null
            return newRate;
        }
        return currentPlaybackRate;
    }

    function evolve(cur_buf, cur_latency, targetLiveDelay, cur_play, cur_qual, future_bw, chunks, next_chunks, last_flag, isdiff, toshow) {
        let tmp_chunks = next_chunks[cur_qual];
        let i = 0;
        let rebuf = 0;
        for (i = 0; i < tmp_chunks.length; i++) {
            let downtime = 8 * tmp_chunks[i] / (1024 * future_bw);
            // if (i >= last_flag) downtime += single_chunk;
            // if (cur_latency < cur_buf + 0.66) downtime = single_chunk;
            if (i == 0) {
                if (isdiff) downtime += 60 / 1000;
                else downtime += 26 / 1000;
            }
            downtime += Math.min(Math.max(chunks[i].idle / 1000, 0), 33 / 1000);

            let tmp_rebuf = Math.max(downtime - cur_buf / cur_play, 0);
            let tmp_min = Math.min(downtime, cur_buf / cur_play)
            cur_buf = Math.max(cur_buf - cur_play * downtime, 0) + single_chunk;
            cur_buf = Math.min(cur_buf, 1.5);
            rebuf += tmp_rebuf;
            cur_latency = cur_latency - (cur_play - 1) * tmp_min + tmp_rebuf;
            cur_play = playbackrate_change(cur_play, cur_latency, targetLiveDelay, cur_buf);
            if (toshow) console.log(i, tmp_chunks[i], downtime * 1000, cur_buf, tmp_rebuf, cur_latency, cur_play, isdiff);
        }
        return { next_buf: cur_buf, next_latency: cur_latency, rebuf: rebuf, next_play: cur_play };
    }

    function decision(cur_seg, chunks, next_chunks, cur_bit, cur_buf, future_bw, cur_latency, targetLiveDelay, cur_play, bitlist, last_flag) {
        let best_bit = 0;
        let best_state = [0, 0, 0];
        let best_reward = -99999999;
        let i;
        let bit_min = bitlist[0];
        let bit_max = bitlist[bitlist.length - 1];
        for (i = 0; i < bitlist.length; i++) {
            let bitrate_current = bitlist[i];
            let toshow = false;
            if (cur_seg == 1) toshow = false
            let res = evolve(cur_buf, cur_latency, targetLiveDelay, cur_play, i, future_bw, chunks, next_chunks, last_flag, bitrate_current != cur_bit, toshow);
            let next_buf = res.next_buf;
            let next_latency = res.next_latency;
            let next_play = res.next_play;
            let seg_rebuf = res.rebuf;
            let seg_qoe = 0;
            seg_qoe = 0.5 * bitrate_current - bit_max * seg_rebuf - bit_max * Math.abs(next_latency - targetLiveDelay) - bit_max * Math.abs(next_play - 1);

            seg_qoe -= Math.abs(bitrate_current - cur_bit);

            // if (cur_seg == 1) console.log(cur_seg, i, bitrate_current, res);

            let tmp;
            let next_qoe = 0;
            if (cur_seg < future_seg) {
                next_qoe = decision(cur_seg + 1, chunks, next_chunks, bitrate_current, next_buf, future_bw, next_latency, targetLiveDelay, next_play, bitlist, last_flag);
                tmp = seg_qoe + next_qoe.qoe;
            }
            else
                tmp = seg_qoe;

            if (cur_seg == 1) console.log(cur_seg, i, bitrate_current, res, tmp);

            if (i == 0) {
                best_bit = i;
                best_state = [next_buf, next_latency, next_play];
                best_reward = tmp;
            }
            if (seg_rebuf > 0 || next_latency > cur_latency) {
                break;
            }
            if (tmp > best_reward) {
                best_bit = i;
                best_state = [next_buf, next_latency, next_play];
                best_reward = tmp;
            }
        }
        // if (cur_seg <= 2) console.log(cur_seg, best_bit, best_reward);
        return { bit: best_bit, qoe: best_reward, state: best_state };
    }

    function cal_diff(last_state, cur_state) {
        let i = 0;
        let diff = [];
        for (i = 0; i < last_state.length; i++) {
            diff.push((last_state[i] - cur_state[i]) / (cur_state[i] + 1e-9));
        }
        diff_all.push(diff[0]);
        if (diff_all.length > buffer_err_len) diff_all.shift();
        let diff_avg = diff_all.reduce((acc, curr) => acc + curr, 0) / diff_all.length;
        let diff_abs = diff_all.reduce((acc, curr) => acc + Math.abs(curr), 0) / diff_all.length;

        // diff_abs = Math.max(...diff_all.map(n => Math.abs(n)));
        let diff_var = diff_all.reduce((total, num) => {
            let ttmp = num - diff_avg;
            return total + ttmp * ttmp;
        }, 0) / diff_all.length;

        diff_var = Math.sqrt(diff_var);

        // diff_abs = (Math.random() * 2 - 1) * diff_var + diff_avg;
        // diff_abs = Math.max(diff_abs, Math.min(...diff_all))
        // diff_abs = Math.min(diff_abs, Math.max(...diff_all))
        // diff_abs = Math.abs(diff_abs)

        let diff_arr = [diff[0], diff_avg, diff_var, diff_abs];
        // console.log(diff_arr);
        return diff_arr;
    }

    function getMaxIndex(rulesContext) {
        try {
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
            const streamInfo = streamController.getActiveStreamInfo().id;
            let currentQuality = abrController.getQualityFor(mediaType, streamInfo);
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
                last_state = [currentBufferLevel[1], latency, playbackRate];
            }
            let cur_state = [currentBufferLevel[1], latency, playbackRate];
            let diff_arr = cal_diff(last_state, cur_state);
            throughputHistory.addBuffer(diff_arr[0]);

            let current_err = 0;
            if (future_bw != -1 && past_bw) {
                let last_bw = past_bw[past_bw.length - 1];
                current_err = (future_bw - last_bw) / (last_bw + 1e-9);
            }

            let delta = cur_state[0] - last_state[0] + (0.5 * currentBitrate) / future_bw - tmp_sum * 8 / 1024 / past_bw[past_bw.length - 1];

            let throughput = cal_future(past_bw, diff_arr);
            // console.log(past_bw, `Throughput ${Math.round(throughput)} kbps`);
            if (isNaN(throughput) || !bufferStateVO) {
                return switchRequest;
            }

            console.log("cal jiange, in rmpc, sum: ", diff_arr[0], diff_arr[1], diff_arr[2], diff_arr[3], current_err, cur_state, currentQuality, currentBitrate, throughput);
            let mpc_start = Date.now();
            let next_q = decision(1, chunks, next_chunks, currentBitrate, currentBufferLevel[1], throughput, latency, targetLiveDelay, playbackRate, next_bit, flag);
            let mpc_end = Date.now();
            console.log("running time/ms: ", mpc_end - mpc_start, next_q);
            switchRequest.quality = next_q.bit;
            last_state = next_q.state;
            // switchRequest.quality = abrController.getQualityForBitrate(mediaInfo, throughput, latency);
            switchRequest.reason = { throughput: throughput, latency: latency };
            switchRequest.priority = SwitchRequest.PRIORITY.STRONG;

            scheduleController.setTimeToLoadDelay(0);

            if (switchRequest.quality !== currentQuality) {
                console.log('[RmpcRule][' + mediaType + '] requesting switch to index: ', switchRequest.quality, 'Average throughput', Math.round(throughput), 'kbps');
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

RmpcRuleClass.__dashjs_factory_name = 'RmpcRule';
RmpcRule = dashjs.FactoryMaker.getClassFactory(RmpcRuleClass);