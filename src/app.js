// --- AUDIO ENGINE ---
let audioCtx = null;
let isPlaying = false;
let nextBeatTime = 0.0;
let timerID = null;
let restEndsAt = 0;
let restDuration = 0;
let session = 0;
const pendingTimers = new Set();
const activeOscillators = new Set();

let bpm = 120;
let currentMeasure = 1;
let currentBeat = 0; // 0 為強音
let incrementCount = 0;
let isResting = false;
let volume = 80;

let cueCounter = 0; 
const cueWords = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen"];

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
});

sigNumerator.addEventListener('input', updateSigUI);
sigDenominator.addEventListener('input', updateSigUI);

function readNumber(input, min, max, fallback) {
    const parsed = Number.parseInt(input.value, 10);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

const numericSettings = [
    [sigNumerator, 1, 16, 4], [stepMeasures, 1, 999, 8],
    [stepAmount, 1, 100, 10], [targetBPM, 30, 400, 200],
    [restIntervals, 1, 999, 4], [restSeconds, 1, 3600, 10],
];
for (const [input, min, max, fallback] of numericSettings) {
    input.addEventListener('change', () => {
        input.value = readNumber(input, min, max, fallback);
        if (input === sigNumerator) updateSigUI();
    });
}

function updateSigUI() {
    signatureDisplay.textContent = `${readNumber(sigNumerator, 1, 16, 4)} / ${sigDenominator.value} TIME`;
}

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

// --- SPEECH ---
function speak(text) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance || volume === 0) return;
    const utterance = new SpeechSynthesisUtterance(text.toString());
    utterance.lang = 'en-US';
    utterance.volume = volume / 100;
    const baseRate = sigDenominator.value == "8" ? (bpm / 160) : (bpm / 100);
    utterance.rate = Math.min(Math.max(baseRate, 1.3), 3.5);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

function later(callback, delay) {
    const id = setTimeout(() => {
        pendingTimers.delete(id);
        if (isPlaying) callback();
    }, Math.max(0, delay));
    pendingTimers.add(id);
}

// --- SOUND ENGINE ---
function playClick(time, isStrong) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const envelope = audioCtx.createGain();
    const masterGain = audioCtx.createGain();

    masterGain.gain.value = volume / 100;
    osc.frequency.setValueAtTime(isStrong ? 1600 : 900, time);
    osc.type = 'triangle';

    envelope.gain.setValueAtTime(1, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(envelope);
    envelope.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    osc.start(time);
    osc.stop(time + 0.1);
    activeOscillators.add(osc);
    osc.onended = () => {
        activeOscillators.delete(osc);
        osc.disconnect();
        envelope.disconnect();
        masterGain.disconnect();
    };

    const delay = (time - audioCtx.currentTime) * 1000;
    later(() => {
        beatLight.classList.add('active');
        later(() => beatLight.classList.remove('active'), 50);
    }, delay);
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
    if (!isResting && nextBeatTime < audioCtx.currentTime - scheduleAheadTime) {
        nextBeatTime = audioCtx.currentTime + 0.01;
    }
    while (!isResting && nextBeatTime < audioCtx.currentTime + scheduleAheadTime) {
        scheduleBeat(nextBeatTime);
        advanceBeat();
    }
    timerID = setTimeout(scheduler, lookahead);
}

function scheduleBeat(time) {
    if (isResting) return;

    const num = readNumber(sigNumerator, 1, 16, 4);

    // CUE 倒數模式
    if (cueCounter >= 1 && cueCounter <= num) {
        playClick(time, true);
        const currentWord = cueWords[cueCounter];
        const delay = (time - audioCtx.currentTime) * 1000;
        later(() => speak(currentWord), delay - 30);
        infoBar.textContent = `CUE: ${currentWord}`;
    } else {
        // 正式運行模式
        playClick(time, currentBeat === 0);
        infoBar.textContent = intervalEnableToggle.checked && bpm >= readNumber(targetBPM, 30, 400, 200)
            ? `TARGET REACHED · BEAT ${currentBeat + 1}` : `BEAT ${currentBeat + 1}`;
    }
}

function advanceBeat() {
    const num = readNumber(sigNumerator, 1, 16, 4);
    // Finish the current beat at its existing tempo before changing speed.
    const beatBase = sigDenominator.value == "8" ? 0.5 : 1.0;
    nextBeatTime += (60.0 / bpm) * beatBase;

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
    later(() => speak("Rest started. Next speed is " + nextGoalBpm), (nextBeatTime - audioCtx.currentTime) * 1000);
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
    for (const osc of activeOscillators) osc.stop();
    activeOscillators.clear();
    window.speechSynthesis?.cancel();
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

    const thisSession = ++session;
    updateBPM(bpmInput.value);
    for (const [input, min, max, fallback] of numericSettings) input.value = readNumber(input, min, max, fallback);
    updateSigUI();
    isPlaying = true;
    isResting = false;
    startBtn.textContent = "STOP";
    startBtn.classList.add('active');
    startBtn.setAttribute('aria-pressed', 'true');
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        if (thisSession !== session || !isPlaying) return;
    } catch {
        stop();
        infoBar.textContent = 'AUDIO UNAVAILABLE — 請確認瀏覽器允許播放音訊';
        return;
    }

    currentMeasure = 1;
    currentBeat = 0;
    incrementCount = 0;

    // 關鍵修復：確保啟動時的時間戳記正確，且 cueCounter 從 1 開始
    nextBeatTime = audioCtx.currentTime + 0.05;
    cueCounter = startCueToggle.checked ? 1 : 0;

    scheduler();
}

startBtn.addEventListener('click', start);
window.addEventListener('pagehide', stop);

updateSigUI();
updateToggleVisuals(intervalEnableToggle, intervalPanel);
updateToggleVisuals(restEnableToggle, restPanel);
