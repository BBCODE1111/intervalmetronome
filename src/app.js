// --- AUDIO ENGINE ---
let audioCtx = null;
let sound = null;
let measureBeats = 4;
let measureNote = 4;
let isPlaying = false;
let nextBeatTime = 0.0;
let timerID = null;
let restEndsAt = 0;
let restDuration = 0;
let session = 0;
const pendingTimers = new Set();

let bpm = 120;
let currentMeasure = 1;
let currentBeat = 0; // 0 為強音
let incrementCount = 0;
let isResting = false;
let volume = 80;

let cueCounter = 0;

const scheduleAheadTime = 0.1;
const lookahead = 25.0;

// --- DOM ELEMENTS ---
const bpmDisplay = document.getElementById('bpmDisplay');
const bpmInput = document.getElementById('bpmInput');
const bpmSlider = document.getElementById('bpmSlider');
const volumeSlider = document.getElementById('volumeSlider');
const volVal = document.getElementById('volVal');
const startBtn = document.getElementById('startBtn');
const beatLight = document.getElementById('beatLight');
const infoBar = document.getElementById('infoBar');
const progressInfo = document.getElementById('progressInfo');
const sigNumerator = document.getElementById('sigNumerator');
const sigDenominator = document.getElementById('sigDenominator');
const signatureDisplay = document.getElementById('signatureDisplay');

const intervalEnableToggle = document.getElementById('intervalEnableToggle');
const intervalPanel = document.getElementById('intervalPanel');
const stepMeasures = document.getElementById('stepMeasures');
const stepAmount = document.getElementById('stepAmount');
const targetBPM = document.getElementById('targetBPM');

const restIntervals = document.getElementById('restIntervals');
const restSeconds = document.getElementById('restSeconds');
const restEnableToggle = document.getElementById('restEnableToggle');
const restPanel = document.getElementById('restPanel');

const startCueToggle = document.getElementById('startCueToggle');
const changeCueToggle = document.getElementById('changeCueToggle');

// --- UI SYNC ---
function updateBPM(val) {
    const parsed = Number.parseInt(val, 10);
    bpm = Number.isFinite(parsed) ? Math.max(30, Math.min(400, parsed)) : bpm;
    bpmDisplay.textContent = bpm;
    bpmInput.value = bpm;
    bpmSlider.value = bpm;
}

bpmInput.addEventListener('change', (e) => updateBPM(e.target.value));
bpmSlider.addEventListener('input', (e) => updateBPM(e.target.value));
volumeSlider.addEventListener('input', (e) => {
    volume = parseInt(e.target.value);
    volVal.textContent = volume + "%";
    sound?.setVolume(volume / 100);
});

sigNumerator.addEventListener('input', updateSigUI);
sigDenominator.addEventListener('input', updateSigUI);

function readNumber(input, min, max, fallback) {
    const parsed = Number.parseInt(input.value, 10);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

const numericSettings = [
    [stepMeasures, 1, 999, 8],
    [stepAmount, 1, 100, 10], [targetBPM, 30, 400, 200],
    [restIntervals, 1, 999, 4], [restSeconds, 1, 3600, 10],
];
for (const [input, min, max, fallback] of numericSettings) {
    input.addEventListener('change', () => {
        input.value = readNumber(input, min, max, fallback);
    });
}

function readBeats() {
    const value = Number(sigNumerator.value);
    return /^\d+$/.test(sigNumerator.value.trim()) && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function updateSigUI() {
    const value = readBeats();
    sigNumerator.setAttribute('aria-invalid', String(value === null));
    document.getElementById('meterError').textContent = value === null ? '請輸入大於 0 的整數拍數（不可有小數）' : '';
    if (value !== null) {
        signatureDisplay.textContent = `${value} / ${sigDenominator.value} TIME`;
        if (value > 4 && sound) sound.ready(value).catch(() => {
            if (isPlaying && readBeats() === value) {
                document.getElementById('meterError').textContent = '拍數語音準備失敗；目前拍號繼續播放，請停止後重試。';
            }
        });
    }
}

function applySignature() {
    const desired = readBeats() ?? measureBeats;
    // During playback, apply a larger meter at a complete boundary once its
    // extra counts are ready, keeping the running beat uninterrupted.
    if (isPlaying && sound && !sound.hasCounts(desired)) return;
    measureBeats = desired;
    measureNote = sigDenominator.value === '8' ? 8 : 4;
}

function beatDuration() { return (60 / bpm) * (measureNote === 8 ? 0.5 : 1); }

function updateToggleVisuals(checkbox, panel) {
    const labels = checkbox.closest('.slide-toggle-wrap').querySelectorAll('.toggle-label');
    if (checkbox.checked) {
        panel.style.opacity = "1";
        labels[0].classList.remove('active-off');
        labels[1].classList.add('active-on');
    } else {
        panel.style.opacity = "0.3";
        labels[0].classList.add('active-off');
        labels[1].classList.remove('active-on');
    }
}

intervalEnableToggle.addEventListener('change', () => updateToggleVisuals(intervalEnableToggle, intervalPanel));
restEnableToggle.addEventListener('change', () => updateToggleVisuals(restEnableToggle, restPanel));

function later(callback, delay) {
    const id = setTimeout(() => {
        pendingTimers.delete(id);
        if (isPlaying) callback();
    }, Math.max(0, delay));
    pendingTimers.add(id);
}

// --- SOUND ENGINE ---
function playClick(time, isStrong, withVoice = false) {
    sound.click(time, isStrong, withVoice);
    later(() => {
        beatLight.classList.add('active');
        later(() => beatLight.classList.remove('active'), 50);
    }, (time - audioCtx.currentTime) * 1000);
}

// --- SCHEDULER ---
function scheduler() {
    if (!isPlaying) return;
    if (isResting) {
        const remaining = restEndsAt - audioCtx.currentTime;
        infoBar.textContent = `REST: ${Math.max(0, Math.min(restDuration, Math.ceil(remaining)))}s`;
        if (remaining <= scheduleAheadTime) {
            isResting = false;
            currentMeasure = 1;
            currentBeat = 0;
            cueCounter = startCueToggle.checked ? 1 : 0;
            nextBeatTime = Math.max(restEndsAt, audioCtx.currentTime + 0.01);
        }
    }
    // Do not emit a backlog of clicks if a browser tab was suspended.
    if (!isResting && nextBeatTime < audioCtx.currentTime + MetronomeAudio.countLeadSeconds + 0.005) {
        nextBeatTime = audioCtx.currentTime + MetronomeAudio.countLeadSeconds + 0.02;
    }
    while (!isResting && nextBeatTime < audioCtx.currentTime + scheduleAheadTime) {
        scheduleBeat(nextBeatTime);
        advanceBeat();
    }
    timerID = setTimeout(scheduler, lookahead);
}

function scheduleBeat(time) {
    if (isResting) return;
    // Meter edits take effect at the next complete measure/count-in boundary.
    if (cueCounter === 1 || (cueCounter === 0 && currentBeat === 0)) applySignature();
    let status;
    if (cueCounter >= 1) {
        sound.count(cueCounter, time, beatDuration());
        playClick(time, true, true);
        status = `CUE: ${cueCounter}`;
    } else {
        playClick(time, currentBeat === 0);
        status = intervalEnableToggle.checked && bpm >= readNumber(targetBPM, 30, 400, 200)
            ? `TARGET REACHED · BEAT ${currentBeat + 1}` : `BEAT ${currentBeat + 1}`;
    }
    later(() => { infoBar.textContent = status; }, (time - audioCtx.currentTime) * 1000);
}

function advanceBeat() {
    const num = measureBeats;
    // Finish the current beat at its existing tempo before changing speed.
    nextBeatTime += beatDuration();

    // 如果在倒數，計數器遞增
    if (cueCounter >= 1 && cueCounter <= num) {
        if (cueCounter === num) {
            cueCounter = 0; // 倒數結束
            currentBeat = 0; // 確保下一拍是第一拍
        } else {
            cueCounter++;
        }
    } else {
        // 正常運作
        currentBeat++;
        if (currentBeat >= num) {
            currentBeat = 0;
            currentMeasure++;
            if (intervalEnableToggle.checked) checkIntervals();
        }
    }

    updateStatusInfo();
}

function checkIntervals() {
    const mLimit = readNumber(stepMeasures, 1, 999, 8);
    const bIncr = readNumber(stepAmount, 1, 100, 10);
    const maxB = readNumber(targetBPM, 30, 400, 200);
    const rIncrLimit = readNumber(restIntervals, 1, 999, 4);

    if (currentMeasure > mLimit) {
        currentMeasure = 1;
        if (bpm >= maxB) return;
        incrementCount++;
        const nextBpm = Math.min(bpm + bIncr, maxB);

        if (restEnableToggle.checked && rIncrLimit > 0 && incrementCount >= rIncrLimit) {
            triggerRest(nextBpm);
        } else {
            if (bpm >= maxB) {
                infoBar.textContent = "TARGET REACHED";
            } else {
                updateBPM(nextBpm);
                if (changeCueToggle.checked) {
                    cueCounter = 1; // 啟動倒數
                    currentBeat = 0;
                }
            }
        }
    }
}

function triggerRest(nextGoalBpm) {
    isResting = true;
    incrementCount = 0;
    const rSec = readNumber(restSeconds, 1, 3600, 10);
    restDuration = rSec;
    restEndsAt = nextBeatTime + rSec;

    updateBPM(nextGoalBpm);
    sound.rest(nextGoalBpm, nextBeatTime, rSec);
    infoBar.textContent = `REST: ${rSec}s`;
}

function updateStatusInfo() {
    progressInfo.textContent = `MSR: ${currentMeasure} | INCR: ${incrementCount} | STATUS: ${!isPlaying ? 'STOPPED' : (isResting ? 'RESTING' : (cueCounter > 0 ? 'CUEING' : 'RUNNING'))}`;
}

function stop() {
    session++;
    clearTimeout(timerID);
    for (const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
    sound?.stop();
    isPlaying = false;
    isResting = false;
    restEndsAt = 0;
    cueCounter = 0;
    beatLight.classList.remove('active');
    startBtn.textContent = 'START';
    startBtn.classList.remove('active');
    startBtn.setAttribute('aria-pressed', 'false');
    infoBar.textContent = 'STOPPED';
    updateStatusInfo();
}

async function start() {
    if (isPlaying) {
        stop();
        return;
    }

    updateSigUI();
    if (readBeats() === null) {
        infoBar.textContent = '請先修正 Beats / MSR 的整數拍數';
        sigNumerator.focus();
        return;
    }
    const thisSession = ++session;
    updateBPM(bpmInput.value);
    for (const [input, min, max, fallback] of numericSettings) input.value = readNumber(input, min, max, fallback);
    applySignature();
    isPlaying = true;
    isResting = false;
    startBtn.textContent = "STOP";
    startBtn.classList.add('active');
    startBtn.setAttribute('aria-pressed', 'true');
    infoBar.textContent = 'PREPARING AUDIO…';
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (!sound) sound = new MetronomeAudio.Engine(audioCtx);
        sound.setVolume(volume / 100);

        // Resume directly from the click gesture, before downloading voice data.
        const resumed = audioCtx.state === 'running' ? Promise.resolve() : audioCtx.resume();
        await Promise.all([resumed, sound.ready(measureBeats)]);
        if (thisSession !== session || !isPlaying) return;
        if (audioCtx.state !== 'running') await audioCtx.resume();
        if (thisSession !== session || !isPlaying) return;
        if (audioCtx.state !== 'running') throw new Error('Audio context is not running');
        if (startCueToggle.checked) sound.prepareCounts(measureBeats, beatDuration());
    } catch {
        if (thisSession !== session || !isPlaying) return;
        stop();
        infoBar.textContent = 'AUDIO UNAVAILABLE — 請確認網路與音訊權限，再按 START 重試';
        return;
    }

    currentMeasure = 1;
    currentBeat = 0;
    incrementCount = 0;

    // No beat is scheduled until all voice samples are decoded and ready.
    nextBeatTime = audioCtx.currentTime + 0.05;
    cueCounter = startCueToggle.checked ? 1 : 0;

    scheduler();
}

startBtn.addEventListener('click', start);
startBtn.textContent = 'START';
startBtn.disabled = false;
window.addEventListener('pagehide', stop);

updateSigUI();
updateToggleVisuals(intervalEnableToggle, intervalPanel);
updateToggleVisuals(restEnableToggle, restPanel);
