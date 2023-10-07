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

function RmpcRuleClass(config) {
    config = config || {};
    let context = this.context;
    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let StreamController = factory.getSingletonFactoryByName('StreamController');
    const dashMetrics = config.dashMetrics;

    let instance;

    function setup() {
        return;
    }

    function cal_future(past_bw) {
        if (!past_bw) return NaN;
        if (past_bw.length == 1) return past_bw[0];
        let total_len = past_bw.length;
        let total_size = 2;
        let i = 0;
        let total_bw = 0;
        for (i = total_len - total_size; i < total_len; i++) {
            total_bw += past_bw[i];
        }
        let future_bw = total_bw / (total_size + 1e-9);
        return future_bw;
    }

    function decision(last_bit, cur_buf, future_bw, cur_latency, cur_play, next_bit, last_flag) {
        let i = 0;
        for (i = next_bit.length - 1; i >= 0; i--) {
            if (next_bit[i] < future_bw) return i;
        }
        return 0;
    }

    function getMaxIndex(rulesContext) {
        try {
            let switchRequest = SwitchRequest(context).create();
            let mediaType = rulesContext.getMediaInfo().type;

            const scheduleController = rulesContext.getScheduleController();
            const playbackController = scheduleController.getPlaybackController();
            let latency = playbackController.getCurrentLiveLatency();
            let abrController = rulesContext.getAbrController();
            const streamInfo = rulesContext.getStreamInfo();
            let currentQuality = abrController.getQualityFor(mediaType, streamInfo);
            const mediaInfo = rulesContext.getMediaInfo();

            // let dashMetrics = factory.getClassFactoryByName('DashMetrics');
            // console.log(config, dashMetrics);

            const bufferStateVO = dashMetrics.getCurrentBufferState(mediaType);
            let currentBufferLevel = dashMetrics.getCurrentBufferLevel(mediaType, true);
            const isDynamic = streamInfo && streamInfo.manifestInfo ? streamInfo.manifestInfo.isDynamic : null;

            if (!latency) {
                latency = 0;
            }

            let playbackRate = playbackController.getPlaybackRate();
            const throughputHistory = abrController.getThroughputHistory();
            let past_bw = throughputHistory.getDict()[mediaType]
            // console.log(past_bw, mediaType);
            let throughput = cal_future(past_bw);
            // console.log(past_bw, `Throughput ${Math.round(throughput)} kbps`);

            if (isNaN(throughput) || !bufferStateVO) {
                return switchRequest;
            }

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
            let flag = httpRequest._responseHeaders.replace("\r", "").replace("\n", "")
            flag = flag.split(":")[1]
            flag = parseInt(flag, 10)
            /*
             * Select next quality
             */

            console.log("sum: ", flag, interval, currentBitrate, currentBufferLevel, throughput, latency, playbackRate, next_bit);
            let next_q = decision(currentBitrate, currentBufferLevel, throughput, latency, playbackRate, next_bit, flag);
            switchRequest.quality = next_q;
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
