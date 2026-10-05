// Only injected by scripts/prepare-browser-qa.mjs into a local QA copy.
// The application itself remains unmodified; observe real voice output on each Start.
const probeLog = document.createElement('pre');
probeLog.id = 'probeLog'; probeLog.setAttribute('role', 'status');
probeLog.style.cssText = 'background:white;color:black;padding:10px;font:12px monospace;white-space:pre-wrap';
document.body.append(probeLog);
const probes = [];
const metrics = document.createElement('pre');
metrics.id = 'startupMetrics';
metrics.style.cssText = probeLog.style.cssText;
document.body.append(metrics);
const startup = {coreReadyAfterNavigationMs:null};
let clickedAt = 0;
const showMetrics = () => { metrics.textContent = JSON.stringify(startup, null, 2); };
MetronomeAudio.preload().then(() => {
  startup.coreReadyAfterNavigationMs = Math.round(performance.now());
  showMetrics();
});
document.getElementById('startBtn').addEventListener('click', () => {
  if (document.getElementById('startBtn').textContent === 'START') {
    clickedAt = performance.now();
    startup.firstScheduledAfterClickMs = null;
    startup.firstObservedSignalAfterClickMs = null;
  }
}, true);
const originalCount = MetronomeAudio.Engine.prototype.count;
MetronomeAudio.Engine.prototype.count = function(number, time, duration) {
  const source = originalCount.call(this, number, time, duration);
  const analyser = this.context.createAnalyser(); analyser.fftSize = 256;
  const silent = this.context.createGain(); silent.gain.value = 0;
  source.connect(analyser); analyser.connect(silent); silent.connect(this.context.destination);
  const record = {number, scheduled:time, peak:0, running:this.context.state};
  if (number === 1 && startup.firstScheduledAfterClickMs === null) {
    startup.firstScheduledAfterClickMs = Math.round(performance.now() - clickedAt + (time - this.context.currentTime) * 1000);
    showMetrics();
  }
  probes.push(record);
  const pcm = new Float32Array(analyser.fftSize);
  const interval = setInterval(() => {
    analyser.getFloatTimeDomainData(pcm);
    record.peak = Math.max(record.peak, ...pcm.map(Math.abs));
    if (number === 1 && record.peak > .001 && startup.firstObservedSignalAfterClickMs === null) {
      startup.firstObservedSignalAfterClickMs = Math.round(performance.now() - clickedAt);
      showMetrics();
    }
    probeLog.textContent = JSON.stringify(probes, null, 2);
    if(this.context.currentTime > time + duration) { clearInterval(interval); analyser.disconnect(); silent.disconnect(); }
  }, 8);
  return source;
};
