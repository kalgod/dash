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

import FactoryMaker from '../../core/FactoryMaker';
import Settings from '../../core/Settings';
import Constants from '../constants/Constants';
import { modifyRequest } from '../utils/RequestModifier';

let tmp_cha = [];

/**
 * @module FetchLoader
 * @ignore
 * @description Manages download of resources via HTTP using fetch.
 * @param {Object} cfg - dependencies from parent
 */
function FetchLoader(cfg) {

    cfg = cfg || {};
    const context = this.context;
    const requestModifier = cfg.requestModifier;
    const lowLatencyThroughputModel = cfg.lowLatencyThroughputModel;
    const boxParser = cfg.boxParser;
    const settings = Settings(context).getInstance();
    let instance, dashMetrics;

    function setup(cfg) {
        dashMetrics = cfg.dashMetrics;
    }

    function load(httpRequest) {
        if (requestModifier && requestModifier.modifyRequest) {
            modifyRequest(httpRequest, requestModifier)
                .then(() => request(httpRequest));
        }
        else {
            request(httpRequest);
        }
    }

    function request(httpRequest) {
        // Variables will be used in the callback functions
        const requestStartTime = new Date();
        const initTime = Date.now();
        console.log("in load ", initTime);
        const request = httpRequest.request;

        const headers = new Headers(); /*jshint ignore:line*/
        if (request.range) {
            headers.append('Range', 'bytes=' + request.range);
        }

        if (httpRequest.headers) {
            for (let header in httpRequest.headers) {
                let value = httpRequest.headers[header];
                if (value) {
                    headers.append(header, value);
                }
            }
        }

        if (!request.requestStartDate) {
            request.requestStartDate = requestStartTime;
        }

        if (requestModifier && requestModifier.modifyRequestHeader) {
            // modifyRequestHeader expects a XMLHttpRequest object so,
            // to keep backward compatibility, we should expose a setRequestHeader method
            // TODO: Remove RequestModifier dependency on XMLHttpRequest object and define
            // a more generic way to intercept/modify requests
            requestModifier.modifyRequestHeader({
                setRequestHeader: function (header, value) {
                    headers.append(header, value);
                }
            }, {
                url: httpRequest.url
            });
        }

        let abortController;
        if (typeof window.AbortController === 'function') {
            abortController = new AbortController(); /*jshint ignore:line*/
            httpRequest.abortController = abortController;
            abortController.signal.onabort = httpRequest.onabort;
        }

        const reqOptions = {
            method: httpRequest.method,
            headers: headers,
            credentials: httpRequest.withCredentials ? 'include' : undefined,
            signal: abortController ? abortController.signal : undefined
        };

        const calculationMode = settings.get().streaming.abr.fetchThroughputCalculationMode;
        const requestTime = Date.now();
        let throughputCapacityDelayMS = 0;

        new Promise((resolve) => {
            if (calculationMode === Constants.ABR_FETCH_THROUGHPUT_CALCULATION_AAST && lowLatencyThroughputModel) {
                throughputCapacityDelayMS = lowLatencyThroughputModel.getThroughputCapacityDelayMS(request, dashMetrics.getCurrentBufferLevel(request.mediaType) * 1000);
                if (throughputCapacityDelayMS) {
                    // safely delay the "fetch" call a bit to be able to meassure the throughput capacity of the line.
                    // this will lead to first few chunks downloaded at max network speed
                    return setTimeout(resolve, throughputCapacityDelayMS);
                }
            }
            resolve();
        })
            .then(() => {
                let markBeforeFetch = Date.now();

                fetch(httpRequest.url, reqOptions).then(function (response) {
                    // let tmp_len = parseInt(response.headers.get('Content-Length'), 10);
                    // console.log("totalbytes %s", tmp_len);
                    console.log('entering: ', httpRequest);
                    // tmp_cha.push(Date.now() - dashMetrics.getCurrentBufferInfo(request.mediaType)[0]);
                    // let average = tmp_cha.reduce((a, b) => a + b, 0) / tmp_cha.length;
                    console.log("cal jiange, in fetch ", httpRequest.url, " time: ", Date.now(), " cur buffer: ", dashMetrics.getCurrentBufferInfo(request.mediaType));
                    if (!httpRequest.response) {
                        httpRequest.response = {};
                    }
                    httpRequest.response.status = response.status;
                    httpRequest.response.statusText = response.statusText;
                    httpRequest.response.responseURL = response.url;

                    if (!response.ok) {
                        httpRequest.onerror();
                    }

                    let responseHeaders = '';
                    for (const key of response.headers.keys()) {
                        responseHeaders += key + ': ' + response.headers.get(key) + '\r\n';
                    }
                    httpRequest.response.responseHeaders = responseHeaders;

                    if (!response.body) {
                        // Fetch returning a ReadableStream response body is not currently supported by all browsers.
                        // Browser compatibility: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
                        // If it is not supported, returning the whole segment when it's ready (as xhr)
                        return response.arrayBuffer().then(function (buffer) {
                            httpRequest.response.response = buffer;
                            const event = {
                                loaded: buffer.byteLength,
                                total: buffer.byteLength,
                                stream: false
                            };
                            httpRequest.progress(event);
                            httpRequest.onload();
                            httpRequest.onend();
                            return;
                        });
                    }

                    const totalBytes = parseInt(response.headers.get('Content-Length'), 10);
                    let flag = parseInt(response.headers.get('flag'), 10);
                    // console.log("flag ", flag);
                    let bytesReceived = 0;
                    let signaledFirstByte = false;
                    let remaining = new Uint8Array();
                    let offset = 0;

                    if (calculationMode === Constants.ABR_FETCH_THROUGHPUT_CALCULATION_AAST && lowLatencyThroughputModel) {
                        let markA = markBeforeFetch;
                        let markB = 0;

                        function fetchMeassurement(stream) {
                            const reader = stream.getReader();
                            const measurement = [];

                            reader.read().then(function processFetch(args) {
                                const value = args.value;
                                const done = args.done;
                                markB = Date.now();

                                if (value && value.length) {
                                    const chunkDownloadDurationMS = markB - markA;
                                    const chunkBytes = value.length;
                                    measurement.push({
                                        chunkDownloadTimeRelativeMS: markB - markBeforeFetch,
                                        chunkDownloadDurationMS,
                                        chunkBytes,
                                        kbps: Math.round(8 * chunkBytes / (chunkDownloadDurationMS / 1000)),
                                        bufferLevel: dashMetrics.getCurrentBufferLevel(request.mediaType)
                                    });
                                }

                                if (done) {

                                    const fetchDuration = markB - markBeforeFetch;
                                    const bytesAllChunks = measurement.reduce((prev, curr) => prev + curr.chunkBytes, 0);

                                    lowLatencyThroughputModel.addMeasurement(request, fetchDuration, measurement, requestTime, throughputCapacityDelayMS, responseHeaders);

                                    httpRequest.progress({
                                        loaded: bytesAllChunks,
                                        total: bytesAllChunks,
                                        lengthComputable: true,
                                        time: lowLatencyThroughputModel.getEstimatedDownloadDurationMS(request),
                                        stream: true
                                    });
                                    return;
                                }
                                markA = Date.now();
                                return reader.read().then(processFetch);
                            });
                        }
                        // tee'ing streams is supported by all current major browsers
                        // https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/tee
                        const [forMeasure, forConsumer] = response.body.tee();
                        fetchMeassurement(forMeasure);
                        httpRequest.reader = forConsumer.getReader();
                    } else {
                        httpRequest.reader = response.body.getReader();
                    }

                    let downloadedData = [];
                    let startTimeData = [];
                    let endTimeData = [];
                    let lastChunkWasFinished = true;

                    let Count = 0;
                    const processResult = function ({ value, done }) { // Bug fix Parse whenever data is coming [value] better than 1ms looking that increase CPU
                        if (done) {
                            if (remaining) {
                                if (calculationMode !== Constants.ABR_FETCH_THROUGHPUT_CALCULATION_AAST) {
                                    // If there is pending data, call progress so network metrics
                                    // are correctly generated
                                    // Same structure as https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequestEventTarget/

                                    httpRequest.progress({
                                        loaded: bytesReceived,
                                        total: isNaN(totalBytes) ? bytesReceived : totalBytes,
                                        lengthComputable: true,
                                        time: calculateDownloadedTime(calculationMode, startTimeData, endTimeData, downloadedData, bytesReceived, flag),
                                        chunks: endTimeData,
                                        stream: true
                                    });
                                }
                                httpRequest.chunks = endTimeData;
                                // console.log(httpRequest);

                                httpRequest.response.response = remaining.buffer;
                            }
                            httpRequest.onload();
                            httpRequest.onend();
                            return;
                        }

                        function pushflag1(curts, cursize, Count) {
                            // console.log("push flag1")
                            startTimeData.push({
                                ts: curts, /* jshint ignore:line */
                                bytes: cursize,
                                id: Count
                            });
                            return;
                        }

                        function pushflag2(curts, curcount, Flag2) {
                            const end = Flag2.lastCompletedOffset + Flag2.size;
                            let cur_buffer = dashMetrics.getCurrentBufferInfo(request.mediaType);
                            console.log("get chunk: ", endTimeData.length + 1, " time: ", Date.now(), " cur buffer: ", cur_buffer[0], cur_buffer[1]);
                            // Store the end time of each chunk download  with its size in array EndTimeData
                            endTimeData.push({
                                ts: curts, /* jshint ignore:line */
                                bytes: end,
                                id: curcount
                            });
                            let data;
                            if (end === remaining.length) {
                                data = remaining;
                                remaining = new Uint8Array();
                                console.log("end==remain remain!!!!!!!!!!!!!!!!!!!!!!!!!!! ", remaining.length);
                            } else {
                                data = new Uint8Array(remaining.subarray(0, end));
                                remaining = remaining.subarray(end);
                                // console.log("end!=remain remain ", remaining.length);
                            }
                            httpRequest.progress({
                                data: data.buffer,
                                lengthComputable: false,
                                noTrace: true
                            });
                            offset = 0;
                            return;
                        }

                        if (value && value.length > 0) {
                            Count += 1;
                            let curTime = Date.now();
                            remaining = concatTypedArray(remaining, value);
                            bytesReceived += value.length;
                            let startts = initTime;
                            if (Count != 1) startts = curTime
                            downloadedData.push({
                                startts: startts,
                                ts: curTime,
                                bytes: value.length
                            });
                            // console.log("new value ", value.length, "remain ", remaining.length, "offset ", offset, "ts ", curTime);
                            // console.log("begin len ", StartTimeData.length, "end len ", EndTimeData.length);
                            if (startTimeData.length - endTimeData.length > 1 || startTimeData.length - endTimeData.length < -1) {
                                console.log("StartTime length wrong !!\n!!!\n");
                            }

                            if (calculationMode === Constants.ABR_FETCH_THROUGHPUT_CALCULATION_MOOF_PARSING) {
                                if (calculationMode === Constants.ABR_FETCH_THROUGHPUT_CALCULATION_MOOF_PARSING && lastChunkWasFinished) {
                                    // Parse the payload and capture the the 'moof' box
                                    const boxesInfo = boxParser.findLastTopIsoBoxCompleted(['moof'], remaining, offset);
                                    if (boxesInfo.found) {
                                        // Store the beginning time of each chunk download in array StartTimeData
                                        lastChunkWasFinished = false;
                                        startTimeData.push({
                                            ts: performance.now(), /* jshint ignore:line */
                                            bytes: value.length,
                                            id: Count
                                        });
                                    }
                                }

                                const boxesInfo = boxParser.findLastTopIsoBoxCompleted(['moov', 'mdat'], remaining, offset);
                                if (boxesInfo.found) {
                                    const end = boxesInfo.lastCompletedOffset + boxesInfo.size;

                                    // Store the end time of each chunk download  with its size in array EndTimeData
                                    if (calculationMode === Constants.ABR_FETCH_THROUGHPUT_CALCULATION_MOOF_PARSING && !lastChunkWasFinished) {
                                        lastChunkWasFinished = true;
                                        endTimeData.push({
                                            ts: performance.now(), /* jshint ignore:line */
                                            bytes: remaining.length,
                                            id: Count
                                        });
                                    }

                                    // If we are going to pass full buffer, avoid copying it and pass
                                    // complete buffer. Otherwise clone the part of the buffer that is completed
                                    // and adjust remaining buffer. A clone is needed because ArrayBuffer of a typed-array
                                    // keeps a reference to the original data
                                    let data;
                                    if (end === remaining.length) {
                                        data = remaining;
                                        remaining = new Uint8Array();
                                    } else {
                                        data = new Uint8Array(remaining.subarray(0, end));
                                        remaining = remaining.subarray(end);
                                    }
                                    // Announce progress but don't track traces. Throughput measures are quite unstable
                                    // when they are based in small amount of data
                                    httpRequest.progress({
                                        data: data.buffer,
                                        lengthComputable: false,
                                        noTrace: true
                                    });

                                    offset = 0;
                                } else {
                                    offset = boxesInfo.lastCompletedOffset;
                                    // Call progress so it generates traces that will be later used to know when the first byte
                                    // were received
                                    if (!signaledFirstByte) {
                                        httpRequest.progress({
                                            lengthComputable: false,
                                            noTrace: true
                                        });
                                        signaledFirstByte = true;
                                    }
                                }
                            }

                            else {
                                while (1) {
                                    // console.log("loop remain ", remaining.length, "offset ", offset);
                                    const Flag1 = boxParser.parsePayload(['moof'], remaining, offset);
                                    // console.log("fetch flag1", Flag1, "len ", value.length, "remain ", remaining.length, "offset ", offset, "ts ", curTime);
                                    const Flag2 = boxParser.parsePayload(['moov', 'mdat'], remaining, offset);
                                    // console.log("fetch flag2", Flag2, "len ", value.length, "remain ", remaining.length, "offset ", offset, "ts ", curTime);
                                    if (Flag1.found && Flag2.found) {
                                        // console.log("found flag1 and flag2");
                                        if (Flag1.lastCompletedOffset < Flag2.lastCompletedOffset) {
                                            pushflag1(curTime, value.length, Count);
                                            pushflag2(curTime, Count, Flag2);
                                        }
                                        else {
                                            pushflag2(curTime, Count, Flag2);
                                        }
                                    }
                                    else if (Flag1.found && !Flag2.found) {
                                        // console.log("found flag1");
                                        pushflag1(curTime, value.length, Count);
                                        offset = Flag2.lastCompletedOffset;
                                        // Call progress so it generates traces that will be later used to know when the first byte
                                        // were received
                                        if (!signaledFirstByte) {
                                            httpRequest.progress({
                                                lengthComputable: false,
                                                noTrace: true
                                            });
                                            signaledFirstByte = true;
                                        }
                                    }
                                    else if (!Flag1.found && Flag2.found) {
                                        // console.log("found flag2");
                                        pushflag2(curTime, Count, Flag2);
                                    }
                                    else {
                                        // console.log("found none");
                                        offset = Flag2.lastCompletedOffset;
                                        // Call progress so it generates traces that will be later used to know when the first byte
                                        // were received
                                        if (!signaledFirstByte) {
                                            httpRequest.progress({
                                                lengthComputable: false,
                                                noTrace: true
                                            });
                                            signaledFirstByte = true;
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                        read(httpRequest, processResult);
                    };
                    read(httpRequest, processResult);
                })
                    .catch(function (e) {
                        if (httpRequest.onerror) {
                            httpRequest.onerror(e);
                        }
                    });
            });
    }

    function read(httpRequest, processResult) {
        httpRequest.reader.read()
            .then(processResult)
            .catch(function (e) {
                if (httpRequest.onerror && httpRequest.response.status === 200) {
                    // Error, but response code is 200, trigger error
                    httpRequest.onerror(e);
                }
            });
    }

    function concatTypedArray(remaining, data) {
        if (remaining.length === 0) {
            return data;
        }
        const result = new Uint8Array(remaining.length + data.length);
        result.set(remaining);
        result.set(data, remaining.length);
        return result;
    }

    function abort(request) {
        if (request.abortController) {
            // For firefox and edge
            request.abortController.abort();
        } else if (request.reader) {
            // For Chrome
            try {
                request.reader.cancel();
                request.onabort();
            } catch (e) {
                // throw exceptions (TypeError) when reader was previously closed,
                // for example, because a network issue
            }
        }
    }

    // Compute the download time of a segment
    function calculateDownloadedTime(calculationMode, startTimeData, endTimeData, downloadedData, bytesReceived, flag) {
        showInfo(startTimeData, endTimeData, downloadedData);
        switch (calculationMode) {
            case Constants.ABR_FETCH_THROUGHPUT_CALCULATION_MOOF_PARSING:
                return _calculateDownloadedTimeByMoofParsing(startTimeData, endTimeData, bytesReceived);
            case Constants.ABR_FETCH_THROUGHPUT_CALCULATION_IMOOF_PARSING:
                return _calculateDownloadedTimeByMoofParsing(startTimeData, endTimeData, bytesReceived);
            case Constants.ABR_FETCH_THROUGHPUT_CALCULATION_DOWNLOADED_DATA:
                return _calculateDownloadedTimeByBytesReceived(downloadedData, bytesReceived);
            case Constants.ABR_FETCH_THROUGHPUT_CALCULATION_FUSION:
                return _calculateDownloadedTimeByFusion(startTimeData, endTimeData, downloadedData, bytesReceived, flag);
            case Constants.ABR_FETCH_THROUGHPUT_CALCULATION_FLEET:
                return _calculateDownloadedTimeByFleet(startTimeData, endTimeData, downloadedData, bytesReceived, flag);
            case Constants.ABR_FETCH_THROUGHPUT_CALCULATION_SEG:
                return _calculateDownloadedTimeBySeg(downloadedData, bytesReceived);
            default:
                return _calculateDownloadedTimeByBytesReceived(downloadedData, bytesReceived);
        }
    }

    function showInfo(startTimeData, endTimeData, downloadedData) {
        let i = 0;
        let datum = startTimeData;
        let datumE = endTimeData;
        for (i = 0; i < downloadedData.length; i++) {
            let data = downloadedData[i];
            console.log("index: ", i, "startts: ", data.startts, "ts: ", data.ts, "bytes: ", data.bytes, "total time: ", downloadedData[downloadedData.length - 1].ts - downloadedData[0].ts);
        }
        for (let i = 0; i < datum.length; i++) {
            if (datum[i] && datumE[i]) {
                console.log("index: ", i, "start ts/size: ", datum[i].ts, "/", datum[i].bytes, "id ", datum[i].id, "end ts/size: ", datumE[i].ts, "/", datumE[i].bytes, "id ", datumE[i].id, "chunk time: ", datumE[i].ts - datum[i].ts);
            }
        }
        return;
    }

    function _calculateDownloadedTimeByFusion(startTimeData, endTimeData, downloadedData, bytesReceived, flag) {
        try {
            let bw_all = [];
            let datum = startTimeData;
            let datumE = endTimeData;
            console.log("flag ", flag)
            // if (flag==0) return _calculateDownloadedTimeByMoofParsing(startTimeData, endTimeData, bytesReceived);
            if (flag > 1) {

                let lastchunk = datumE[flag - 1].id;
                // console.log("lastchunk", lastchunk);
                if (lastchunk > 2) {
                    let i = 0;
                    let fusion_bytes = 0;
                    for (i = 1; i < lastchunk - 1; i++) {
                        fusion_bytes += downloadedData[i].bytes;
                        // console.log("fusion ",fusion_bytes);
                    }
                    let fusion_time = downloadedData[lastchunk - 2].ts - downloadedData[0].ts;
                    fusion_time = Math.max(1, fusion_time);
                    let fusion_bw = 8 * fusion_bytes / fusion_time;
                    bw_all.push({ bw: fusion_bw, size: fusion_bytes });
                    console.log("testing mode, using flag", fusion_bw, flag);
                    console.log("fusion bytes time and bw ", fusion_bytes, fusion_time, fusion_bw);
                }
            }

            if (bw_all.length == 0) {

                let i = 0;
                for (i = 0; i < 1; i++) {
                    let schunk = datum[i].id;
                    let echunk = datumE[i].id;
                    let j = 0;
                    if (schunk + 1 >= echunk) continue
                    let tmp_bytes = 0;
                    // console.log("schunk/echunk", i, schunk, echunk);
                    for (j = schunk; j < echunk - 1; j++) tmp_bytes += downloadedData[j].bytes;
                    let fusion_time = downloadedData[echunk - 2].ts - downloadedData[schunk - 1].ts;
                    fusion_time = Math.max(1, fusion_time);
                    let tmp_bw = 8 * tmp_bytes / fusion_time;
                    // console.log(tmp_bytes, fusion_time, tmp_bw);
                    bw_all.push({ bw: tmp_bw, size: tmp_bytes });
                    console.log("testing mode,back A, small chunks", tmp_bw, flag);
                }
            }


            if (bw_all.length == 0) {

                let fusion_bytes = downloadedData[0].bytes;
                let fusion_time = downloadedData[0].ts - downloadedData[0].startts;
                fusion_time = Math.max(1, fusion_time);
                let fusion_bw = 8 * fusion_bytes / fusion_time;
                bw_all.push({ bw: fusion_bw, size: fusion_bytes });
                console.log("testing mode,back B, first http chunk", fusion_bw, flag);
            }

            // console.log(bw_all);

            let real_bw = 0;
            let real_size = 0;
            let i = 0;
            for (i = 0; i < bw_all.length; i++) {
                let cur_bw = bw_all[i].bw;
                let cur_size = bw_all[i].size;
                if (cur_size < 1400) continue
                real_bw += cur_bw * cur_size;
                real_size += cur_size;
                console.log("cur bw/size", i, cur_bw, cur_size);
            }

            // console.log(real_bw);
            real_bw = real_bw / (real_size + 1e-9);
            real_bw = Math.min(real_bw, 15000);
            console.log("real bw ", real_bw);
            if (real_bw == 0 || real_size == 0) {
                console.log("fusion failed, fall back to moof");
                return _calculateDownloadedTimeByMoofParsing(startTimeData, endTimeData, bytesReceived);
            }
            return bytesReceived * 8 / (real_bw + 1e-9);
        } catch (e) {
            return null;
        }
    }

    function _calculateDownloadedTimeByFleet(startTimeData, endTimeData, downloadedData, bytesReceived, flag) {
        try {
            let bw_all = [];
            let datum = startTimeData;
            let datumE = endTimeData;
            console.log("in fleet ", flag);
            // if (flag==0) return _calculateDownloadedTimeByMoofParsing(startTimeData, endTimeData, bytesReceived);

            if (bw_all.length == 0) {
                console.log("back A, small chunks");
                let i = 0;
                for (i = 0; i < datumE.length; i++) {
                    let schunk = datum[i].id;
                    let echunk = datumE[i].id;
                    let j = 0;
                    if (i < datumE.length - 1) {
                        if (datum[i + 1].id == echunk) echunk -= 1;
                    }
                    if (schunk >= echunk) continue
                    let tmp_bytes = 0;
                    // console.log("schunk/echunk", i, schunk, echunk);
                    for (j = schunk; j < echunk; j++) {
                        tmp_bytes = downloadedData[j].bytes;
                        let fusion_time = downloadedData[j].ts - downloadedData[j - 1].ts;
                        fusion_time = Math.max(1, fusion_time);
                        let tmp_bw = 8 * tmp_bytes / fusion_time;
                        // console.log(tmp_bytes, fusion_time, tmp_bw);
                        bw_all.push({ bw: tmp_bw, size: tmp_bytes });
                    }
                }
            }


            if (bw_all.length == 0) {
                console.log("back B, first http chunk");
                let fusion_bytes = downloadedData[0].bytes;
                let fusion_time = downloadedData[0].ts - downloadedData[0].startts;
                fusion_time = Math.max(1, fusion_time);
                let fusion_bw = 8 * fusion_bytes / fusion_time;
                bw_all.push({ bw: fusion_bw, size: fusion_bytes });
            }

            // console.log(bw_all);
            // bw_all = bw_all.slice(-3)

            let real_bw = 0;
            let real_size = 0;
            let i = 0;
            for (i = 0; i < bw_all.length; i++) {
                let cur_bw = bw_all[i].bw;
                let cur_size = bw_all[i].size;
                if (cur_size < 500) continue
                real_bw += cur_bw * 1;
                real_size += 1;
                // console.log("cur bw/size", i, cur_bw, cur_size);
            }

            // console.log(real_bw);
            real_bw = real_bw / (real_size + 1e-9);
            real_bw = Math.min(real_bw, 15000);
            console.log("real bw ", real_bw);
            if (real_bw == 0 || real_size == 0) {
                console.log("fleet failed, fall back to moof");
                return _calculateDownloadedTimeByMoofParsing(startTimeData, endTimeData, bytesReceived);
            }
            return bytesReceived * 8 / (real_bw + 1e-9);
        } catch (e) {
            return null;
        }
    }

    function _calculateDownloadedTimeBySeg(downloadedData, bytesReceived) {
        try {
            let real_size = 0;
            let i = 0;
            for (i = 1; i < downloadedData.length; i++) {
                real_size += downloadedData[i].bytes;
            }
            let real_time = downloadedData[downloadedData.length - 1].ts - downloadedData[0].ts;
            // real_time=Math.max(1,real_time)
            if (real_time == 0) {
                return downloadedData[downloadedData.length - 1].ts - downloadedData[0].startts;
            }
            let real_bw = 8 * real_size / (real_time + 1e-9);
            return bytesReceived * 8 / (real_bw + 1e-9);
        } catch (e) {
            return null;
        }
    }

    function calculateThroughputByChunkData(startTimeData, endTimeData) {
        try {
            let datum, datumE;
            // Filter the last chunks in a segment in both arrays [StartTimeData and EndTimeData]
            datum = startTimeData.filter((data, i) => i < startTimeData.length - 1);
            datumE = endTimeData.filter((dataE, i) => i < endTimeData.length - 1);
            let chunkThroughputs = [];
            // Compute the average throughput of the filtered chunk data
            if (datum.length > 1) {
                let shortDurationBytesReceived = 0;
                let shortDurationStartTime = 0;
                for (let i = 0; i < datum.length; i++) {
                    if (datum[i] && datumE[i]) {
                        let chunkDownloadTime = datumE[i].ts - datum[i].ts;
                        if (chunkDownloadTime > 1) {
                            chunkThroughputs.push((8 * datumE[i].bytes) / chunkDownloadTime);
                            console.log("pushing", (8 * datumE[i].bytes) / chunkDownloadTime, datumE[i].bytes);
                            shortDurationStartTime = 0;
                        } else {
                            if (shortDurationStartTime === 0) {
                                shortDurationStartTime = datum[i].ts;
                                shortDurationBytesReceived = 0;
                            }
                            let cumulatedChunkDownloadTime = datumE[i].ts - shortDurationStartTime;
                            if (cumulatedChunkDownloadTime > 1) {
                                shortDurationBytesReceived += datumE[i].bytes;
                                chunkThroughputs.push((8 * shortDurationBytesReceived) / cumulatedChunkDownloadTime);
                                console.log("pushing", (8 * shortDurationBytesReceived) / cumulatedChunkDownloadTime, shortDurationBytesReceived);
                                shortDurationStartTime = 0;
                            } else {
                                // continue cumulating short duration data
                                shortDurationBytesReceived += datumE[i].bytes;
                            }
                        }
                    }
                }

                if (chunkThroughputs.length > 0) {
                    const sumOfChunkThroughputs = chunkThroughputs.reduce((a, b) => a + b, 0);
                    return sumOfChunkThroughputs / chunkThroughputs.length;
                }
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    function _calculateDownloadedTimeByMoofParsing(startTimeData, endTimeData, bytesReceived) {
        try {
            let real_bw = calculateThroughputByChunkData(startTimeData, endTimeData);
            return 8 * bytesReceived / real_bw;

            return null;
        } catch (e) {
            return null;
        }
    }

    function _calculateDownloadedTimeByBytesReceived(downloadedData, bytesReceived) {
        try {
            downloadedData = downloadedData.filter(data => data.bytes > ((bytesReceived / 4) / downloadedData.length));
            if (downloadedData.length > 1) {
                let time = 0;
                const avgTimeDistance = (downloadedData[downloadedData.length - 1].ts - downloadedData[0].ts) / downloadedData.length;
                downloadedData.forEach((data, index) => {
                    // To be counted the data has to be over a threshold
                    const next = downloadedData[index + 1];
                    if (next) {
                        const distance = next.ts - data.ts;
                        time += distance < avgTimeDistance ? distance : 0;
                        console.log("index: ", index, "ts: ", data.ts, "bytes: ", data.bytes, "dis: ", next.ts - data.ts, "avg: ", avgTimeDistance, "cur time: ", time, "total time: ", downloadedData[downloadedData.length - 1].ts - downloadedData[0].ts);
                    }
                });
                return time;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    instance = {
        load: load,
        abort: abort,
        calculateDownloadedTime: calculateDownloadedTime,
        setup
    };

    return instance;
}

FetchLoader.__dashjs_factory_name = 'FetchLoader';

const factory = FactoryMaker.getClassFactory(FetchLoader);
export default factory;
