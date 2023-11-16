const fs = require("fs");
const puppeteer = require("puppeteer-core");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
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
    fs.readFile(pre_path + dirs + '/' + trace, 'utf8', (err, data) => {
      if (err) {
        console.log(err);
        return;
      }
      const lines = data.split('\n');
      lines.forEach(line => {
        if (line.trim().length == 0) return;
        const bandwidthTime = line.split(' ');
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

    let targethtml = "/home/cjh/work/dash/dash.js/samples/low-latency/test.html";
    prepare_html(targethtml, alg);

    const { exec } = require('child_process');
    tmp_comm = 'python3 trace_run.py ' + pre_path + dirs + '/' + trace + ' ./bw_truth/' + dirs + '/' + trace + "/" + alg;
    // console.log("%s", tmp_comm);
    // exec(tmp_comm);
    console.log("now1", Date.now());

    targethtml = "file://" + targethtml;
    await page.goto(targethtml);

    console.log("now2", Date.now(), targethtml);
    const cdpClient = await page.target().createCDPSession();

    readTrace(cdpClient, traceData, './bw_truth/' + dirs + '/' + trace + "/" + alg);

    console.log("Waiting for player to setup.");

    page.on('console', message => {
      if (message.text().includes('JSHandle@object')) {
        message.args().forEach(async arg => {
          const value = await arg.jsonValue();
          console.dir(value);
        });
      } else {
        console.log(`[${message.type().toUpperCase()}] ${message.text()}`);
      }
    });

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

  function prepare_html(targethtml, alg) {
    let tmp = alg.split("-")
    let abrval = tmp[2];
    let meaval = tmp[0];
    let preval = tmp[1];
    let abrreplace, meareplace, prereplace;
    if (abrval.includes("lolp")) {
      abrreplace = 'abrLoLP';
    }
    else if (abrval.includes("l2all")) {
      abrreplace = 'abrL2A';
    }
    else if (abrval.includes("rb")) {
      abrreplace = 'abrThroughput';
    }
    else if (abrval.includes("rmpc")) {
      abrreplace = 'RmpcRule';
    }
    else if (abrval.includes("bola")) {
      abrreplace = 'abrBola';
    }
    else if (abrval.includes("dyn")) {
      abrreplace = 'abrDynamic';
    }
    else {
      console.log("wrong abr");
      process.exit(0);
    }

    if (meaval.includes("fusion")) {
      meareplace = 'abrFetchThroughputCalculationFusion';
    }
    else if (meaval.includes("fleet")) {
      meareplace = 'abrFetchThroughputCalculationFleet';
    }
    else if (meaval.includes("imoof")) {
      meareplace = 'abrFetchThroughputCalculationIMoofParsing';
    }
    else if (meaval.includes("moof")) {
      meareplace = 'abrFetchThroughputCalculationMoofParsing';
    }
    else if (meaval.includes("aast")) {
      meareplace = 'abrFetchThroughputCalculationAAST';
    }
    else if (meaval.includes("down")) {
      meareplace = 'abrFetchThroughputCalculationDownloadedData';
    }
    else if (meaval.includes("seg")) {
      meareplace = 'abrFetchThroughputCalculationSeg';
    }
    else {
      console.log("wrong mea");
      process.exit(0);
    }

    if (preval.includes("slide")) {
      prereplace = 'slidingWindow';
    }
    else if (preval.includes("ewma")) {
      prereplace = 'ewma';
    }
    else {
      console.log("wrong pre");
      process.exit(0);
    }

    let fileContent = fs.readFileSync(targethtml, 'utf8');
    // 找到目标字符串并提取其中的内容
    let regex1 = /let abrval = '([^']+)'/;
    let match1 = fileContent.match(regex1);

    let regex2 = /let meaval = '([^']+)'/;
    let match2 = fileContent.match(regex2);

    let regex3 = /let preval = '([^']+)'/;
    let match3 = fileContent.match(regex3);

    if (match1[1] && match2[1] && match3[1]) {
      let modifiedContent = fileContent.replace("let abrval = '" + match1[1] + "'", "let abrval = '" + abrreplace + "'");
      modifiedContent = modifiedContent.replace("let meaval = '" + match2[1] + "'", "let meaval = '" + meareplace + "'");
      modifiedContent = modifiedContent.replace("let preval = '" + match3[1] + "'", "let preval = '" + prereplace + "'");
      fs.writeFileSync(targethtml, modifiedContent, 'utf8');
    } else {
      console.log('未在文件中找到目标字符串。');
      process.exit(0);
    }

    console.log(abrreplace, meareplace, prereplace);
  }

  function setNetworkSpeedInMbps(client, kbps) {
    // console.log("in setnetwork", kbps);
    client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      uploadThroughput: (kbps * 1024) / 8,
      downloadThroughput: (kbps * 1024) / 8
    });
  }

});
