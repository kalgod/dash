const fs = require("fs");
const puppeteer = require("puppeteer-core");
const stats = require("./stats");
// const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_PATH = "/opt/google/chrome/chrome";

const { QoeEvaluator, QoeInfo } = require("../dash.js-3.2.0/samples/low-latency/abr/LoLp_QoEEvaluation.js");

// custom
const pre_path = "./trace/raw/"
const dirs = process.argv[2];
const trace = process.argv[3];
const alg = process.argv[4];

const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
let throughputMeasurements = { trueValues: [], measuredValues: [] };

// Wait X ms before starting browser
function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
const waitSeconds = 0;
console.log('Wait ' + waitSeconds + 's before starting browser..');
sleep(waitSeconds * 1000).then(() => {

  run()
    .then((result) => {
      if (result) {
        if (!fs.existsSync('./results')) {
          fs.mkdirSync('./results');
        }
        let folder = "./results/" + dirs + "/" + trace;
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder);
        }
        folder = "./results/" + dirs + "/" + trace + "/" + alg;
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder);
        }

        let filenameByDownload = folder + '/metrics-by-download.json';
        let filenameOverall = folder + '/metrics-overall.json';
        let filenameEvaluate = folder + '/evaluate.json';
        let filenameQoePerSegment = folder + '/qoe-by-segment.json';
        let filenameThroughput = folder + '/throughput-measurements.json';

        fs.writeFileSync(filenameByDownload, JSON.stringify(result.byDownload));
        fs.writeFileSync(filenameOverall, JSON.stringify(result.overall));

        let evaluate = {};
        evaluate.testTime = new Date();
        evaluate.networkProfile = result.networkProfile;
        evaluate.abrStrategy = result.abrStrategy;
        evaluate.customPlaybackControl = result.customPlaybackControl;

        ///////////////////////////////////////////////////////////////////////////////////
        // QoE model
        // References - See QoeEvaluator.js 
        //            - https://xia.cs.cmu.edu/resources/Documents/Yin_sigcomm15.pdf
        ///////////////////////////////////////////////////////////////////////////////////
        let qoeEvaluator = new QoeEvaluator();
        let segmentDurationSec = result.misc.segmentDurationSec;
        let maxBitrateKbps = result.misc.maxBitrateKbps;
        let minBitrateKbps = result.misc.minBitrateKbps;
        qoeEvaluator.setupPerSegmentQoe(segmentDurationSec, maxBitrateKbps, minBitrateKbps);

        // let qoeBySegmentCsv = [];
        // qoeBySegmentCsv.push('segment, qoe_overall, qoe_bitrate, qoe_rebuf, qoe_latency, qoe_bitrateSwitch, qoe_playbackSpeed');
        let qoePerSegment = {};

        let numSegments = 0;
        for (var key in result.byDownload) {
          if (result.byDownload.hasOwnProperty(key)) {
            let segmentBitrateKbps = result.byDownload[key].segmentBitrateKbps;
            let segmentRebufferTimeSec = result.byDownload[key].segmentStallDurationMs / 1000.0;
            let latencySec = result.byDownload[key].currentLatency;
            let playbackSpeed = result.byDownload[key].playbackSpeed;
            qoeEvaluator.logSegmentMetrics(segmentBitrateKbps, segmentRebufferTimeSec, latencySec, playbackSpeed);

            // Log qoe result at each segment
            let qoeInfo = qoeEvaluator.getPerSegmentQoe();
            // let tmpArray = [key, qoeInfo.totalQoe, qoeInfo.bitrateWSum, qoeInfo.rebufferWSum, qoeInfo.latencyWSum, qoeInfo.bitrateSwitchWSum, qoeInfo.playbackSpeedWSum];
            // qoeBySegmentCsv.push(tmpArray.toString());
            qoePerSegment[key] = {
              qoeTotal: qoeInfo.totalQoe,
              qoeBitrate: qoeInfo.bitrateWSum,
              qoeRebuffer: qoeInfo.rebufferWSum,
              qoeLatency: qoeInfo.latencyWSum,
              qoeBitrateSwitch: qoeInfo.bitrateSwitchWSum,
              qoePlaybackSpeed: qoeInfo.playbackSpeedWSum
            }

            throughputMeasurements.measuredValues.push({
              throughputKbps: result.byDownload[key].throughputKbps,
              timestampMs: result.byDownload[key].throughputTimestampMs
            });

            numSegments++;
          }
        }

        evaluate.resultsQoe = qoeEvaluator.getPerSegmentQoe(); // returns QoeInfo object
        evaluate.numSegments = numSegments;

        // convert string to boolean
        const batchTestEnabled = (process.env.npm_package_batchTest_enabled == 'true');

        // console.log(process.env.npm_package_batchTest_enabled, batchTestEnabled)

        // finally, allow to optionally input comments
        if (!batchTestEnabled) {
          // user input
          evaluate.comments = "No comments";

          fs.writeFileSync(filenameEvaluate, JSON.stringify(evaluate));
          fs.writeFileSync(filenameQoePerSegment, JSON.stringify(qoePerSegment));
          fs.writeFileSync(filenameThroughput, JSON.stringify(throughputMeasurements));

          console.log('Results files generated:');
          console.log('> ' + filenameByDownload);
          console.log('> ' + filenameOverall);
          console.log('> ' + filenameEvaluate);
          console.log('> ' + filenameQoePerSegment);
          console.log('> ' + filenameThroughput);
          console.log("Test finished. Press cmd+c to exit.");
          process.exit(0);
        }
        else {
          // batch script input
          if (process.env.npm_package_batchTest_comments)
            evaluate.comments = process.env.npm_package_batchTest_comments;
          else
            evaluate.comments = "Batch test, no additional comments."

          fs.writeFileSync(filenameEvaluate, JSON.stringify(evaluate));
          fs.writeFileSync(filenameQoePerSegment, JSON.stringify(qoePerSegment));
          fs.writeFileSync(filenameThroughput, JSON.stringify(throughputMeasurements));

          console.log('Results files generated:');
          console.log('> ' + filenameByDownload);
          console.log('> ' + filenameOverall);
          console.log('> ' + filenameEvaluate);
          console.log('> ' + filenameQoePerSegment);
          console.log('> ' + filenameThroughput);
          console.log('')

          process.exit(0);
        }
      }
      else {
        console.log('Unable to generate test results, likely some error occurred.. Please check program output above.')
        console.log("Exiting with code 1...");
        process.exit(1);
      }
    })
    .catch(error => console.log(error));

  async function run() {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      defaultViewport: null,
      devtools: true,
      args: ['--no-sandbox'],
    });

    // 定义数组保存内容
    let traceData = [];

    // 使用fs模块读取文件
    // const fs = require('fs');

    fs.readFile(pre_path + dirs + '/' + trace, 'utf8', (err, data) => {
      if (err) {
        console.log(err);
        return;
      }

      // 按行split文件内容
      const lines = data.split('\n');

      // 遍历每行
      lines.forEach(line => {
        if (line.trim().length == 0) return;

        // 每行内容split空格分隔
        const bandwidthTime = line.split(' ');

        // 保存到数组 
        traceData.push({
          bandwidth: parseFloat(bandwidthTime[1]),
          time: parseFloat(bandwidthTime[0])
        });

      });
    });
    const page = await browser.newPage();
    page.setUserAgent("puppeteer");

    let folder = './bw_truth/' + dirs + '/' + trace;
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }

    const { exec } = require('child_process');
    tmp_comm = 'python3 trace_run.py ' + pre_path + dirs + '/' + trace + ' ./bw_truth/' + dirs + '/' + trace + "/" + alg;
    // console.log("%s", tmp_comm);
    // exec(tmp_comm);
    console.log("now1", Date.now());

    let targethtml = "file:///home/cjh/work/dash/dash.js/samples/low-latency/" + alg + ".html"
    await page.goto(targethtml);

    console.log("now2", Date.now(), targethtml);
    const cdpClient = await page.target().createCDPSession();

    // readTrace(cdpClient, traceData, './bw_truth/' + dirs + '/' + trace + "/" + alg);

    console.log("Waiting for player to setup.");
    // const hasLoaded = player.getBitrateInfoListFor("video");
    // console.log(hasLoaded, hasLoaded.length == 0);
    // page.on('console', message => {
    //   const type = message.type().toUpperCase();
    //   const text = message.text();

    //   if (type === 'LOG') {
    //     console.log(text);
    //   } else if (type === 'ERROR') {
    //     console.error(text);
    //   } else if (type === 'WARNING') {
    //     console.warn(text);
    //   } else if (type === 'INFO') {
    //     console.info(text);
    //   } else if (type === 'DEBUG') {
    //     console.debug(text);
    //   } else {
    //     console.log(`[${type}] ${text}`);
    //   }

    //   const args = message.args();
    //   args.forEach(arg => {
    //     arg.jsonValue().then(value => {
    //       console.dir(value);
    //     }).catch(err => {
    //       console.log(err);
    //     });
    //   });
    // });
    await page.evaluate(() => {
      return new Promise(resolve => {
        const hasLoaded = player.getBitrateInfoListFor("video").length !== 0;
        if (hasLoaded) {
          console.log('Stream loaded, setup complete.');
          resolve();
        } else {
          console.log('Waiting for stream to load.');
          player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, (e) => {
            console.log('Load complete.')
            resolve();
          });
        }
      });
    });
    console.log("Waiting for 10 seconds of uninterrupted max-quality playback before starting.");
    console.log("Player is stable at the max quality, beginning network emulation");
    page.evaluate(() => {
      window.startRecording();
    });

    let tosleep = 60;
    // tosleep = traceData[traceData.length - 2].time;
    await (sleep(tosleep * 1000))

    const metrics = await page.evaluate(() => {
      if (window.stopRecording) {
        // Guard against closing the browser window early
        window.stopRecording();
      }
      player.pause();
      return window.abrHistory;
    });
    console.log("Run complete", Date.now());
    if (!metrics) {
      console.log("No metrics were returned. Stats will not be logged.");
    }

    console.log('Processing client metrics to results files..');

    // metrics-by-download.json
    let resultByDownload = {};
    let numStalls = 0;
    if (metrics.byDownload) {
      resultByDownload = metrics.byDownload;
      for (var key in resultByDownload) {
        if (resultByDownload.hasOwnProperty(key)) {
          resultByDownload[key].averageBitrate = stats.computeAverageBitrate(resultByDownload[key].switchHistory, resultByDownload[key].downloadTimeRelative);
          resultByDownload[key].numSwitches = resultByDownload[key].switchHistory.length;
          if (resultByDownload[key].numStalls > numStalls) numStalls = resultByDownload[key].numStalls;
        }
      }
    }

    // metrics-overall.json
    let resultOverall = {};
    if (metrics.overall) {
      resultOverall = metrics.overall;
      resultOverall.averageBitrate = stats.computeAverageBitrate(resultOverall.switchHistory);
      resultOverall.numSwitches = resultOverall.switchHistory.length;
      resultOverall.numStalls = numStalls;
      // calculate averageBitrateVariations
      if (resultOverall.switchHistory.length > 1) {
        let totalBitrateVariations = 0;
        for (var i = 0; i < resultOverall.switchHistory.length - 1; i++) {
          totalBitrateVariations += Math.abs(resultOverall.switchHistory[i + 1].quality.bitrate - resultOverall.switchHistory[i].quality.bitrate);
        }
        resultOverall.averageBitrateVariations = totalBitrateVariations / (resultOverall.switchHistory.length - 1);
      } else {
        resultOverall.averageBitrateVariations = 0;
      }
      // calculate average playback rates
      let pbr = stats.computeAveragePlaybackRate(resultByDownload);
      resultOverall.averagePlaybackRate = pbr.averagePlaybackRate;
      resultOverall.averagePlaybackRateNonOne = pbr.averagePlaybackRateNonOne;
      // delete unwanted data
      delete resultOverall.currentLatency;
      delete resultOverall.currentBufferLength;
    }

    let result = {
      byDownload: resultByDownload,
      overall: resultOverall,
      networkProfile: trace,
      abrStrategy: metrics.abrStrategy,
      customPlaybackControl: metrics.customPlaybackControl,
      misc: metrics.misc
    };

    return result;

  }

  async function readTrace(client, traceData, targetfile) {
    fs.openSync(targetfile, 'w+');

    for (let i = 0; i < traceData.length - 1; i++) {

      let item = traceData[i];
      let nextitem = traceData[i + 1];

      setNetworkSpeedInMbps(client, parseFloat(1024 * item.bandwidth));

      data = item.bandwidth + " " + String(parseFloat(Date.now()) / 1000.0) + "\n";
      fs.appendFileSync(targetfile, data);

      await new Promise(resolve => setTimeout(resolve, 1000 * (nextitem.time - item.time)));

    }

  }

  function setNetworkSpeedInMbps(client, kbps) {
    // console.log(kbps);
    client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      uploadThroughput: (kbps * 1024) / 8,
      downloadThroughput: (kbps * 1024) / 8
    });
  }

});
