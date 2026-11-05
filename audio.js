'use strict';

// ═══════════════════════════════════════════════
// ЗВУКОВОЙ ДВИЖОК
// Непрерывные слои (гул ЭЛТ, натяжение цилиндра, скрежет металла)
// + разовые эффекты. Всё синтезируется в Web Audio API.
// ═══════════════════════════════════════════════
const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let enabled = localStorage.getItem('oz.sound') !== 'off';
  let noiseBuf = null;
  const L = {}; // непрерывные слои

  function init() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(2);
      buildLayers();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function makeNoise(sec) {
    const size = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function loopNoise() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  function buildLayers() {
    // Гул ЭЛТ-монитора: 50 и 100 Гц + тихое шипение
    L.hum = ctx.createGain();
    L.hum.gain.value = 0;
    L.hum.connect(master);
    [[50, 0.5], [100, 0.3], [150, 0.08]].forEach(([f, v]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g).connect(L.hum);
      o.start();
    });
    const hiss = loopNoise();
    const hissF = ctx.createBiquadFilter();
    hissF.type = 'highpass';
    hissF.frequency.value = 6000;
    const hissG = ctx.createGain();
    hissG.gain.value = 0.12;
    hiss.connect(hissF).connect(hissG).connect(L.hum);

    // Натяжение цилиндра: низкий «скрип», высота растёт с поворотом
    L.turnOsc = ctx.createOscillator();
    L.turnOsc.type = 'sawtooth';
    L.turnOsc.frequency.value = 45;
    const turnF = ctx.createBiquadFilter();
    turnF.type = 'lowpass';
    turnF.frequency.value = 380;
    L.turn = ctx.createGain();
    L.turn.gain.value = 0;
    L.turnOsc.connect(turnF).connect(L.turn).connect(master);
    L.turnOsc.start();

    // Скрежет металла: шум через резонансный фильтр с «дрожащей» частотой
    const grindSrc = loopNoise();
    L.grindF = ctx.createBiquadFilter();
    L.grindF.type = 'bandpass';
    L.grindF.Q.value = 6;
    L.grindF.frequency.value = 300;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG).connect(L.grindF.frequency);
    lfo.start();
    L.grind = ctx.createGain();
    L.grind.gain.value = 0;
    grindSrc.connect(L.grindF).connect(L.grind).connect(master);

    // Визг перегруженной отмычки (появляется при сильном износе)
    L.squealOsc = ctx.createOscillator();
    L.squealOsc.type = 'triangle';
    L.squealOsc.frequency.value = 1800;
    const vib = ctx.createOscillator();
    vib.frequency.value = 23;
    const vibG = ctx.createGain();
    vibG.gain.value = 40;
    vib.connect(vibG).connect(L.squealOsc.frequency);
    vib.start();
    L.squeal = ctx.createGain();
    L.squeal.gain.value = 0;
    L.squealOsc.connect(L.squeal).connect(master);
    L.squealOsc.start();
  }

  function to(param, value, tc = 0.05) {
    if (!ctx) return;
    param.setTargetAtTime(value, ctx.currentTime, tc);
  }

  // Вызывается каждый кадр из игрового цикла
  function update({ hum, turning, rot, jammed, wear }) {
    if (!ctx || !L.hum) return;
    to(L.hum.gain, hum ? 0.018 : 0, 0.4);
    to(L.turn.gain, turning && !jammed ? 0.05 : 0, 0.04);
    to(L.turnOsc.frequency, 40 + rot * 0.9, 0.05);
    to(L.grind.gain, jammed ? 0.35 + wear / 300 : 0, jammed ? 0.02 : 0.06);
    to(L.grindF.frequency, 260 + wear * 6, 0.1);
    to(L.squeal.gain, jammed && wear > 45 ? (wear - 45) / 55 * 0.025 : 0, 0.05);
    to(L.squealOsc.frequency, 1500 + wear * 12, 0.1);
  }

  function tone(freq, type, dur, vol = 0.1, delay = 0) {
    if (!ctx) return;
    try {
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function noise(dur, vol = 0.1, freq = 900, type = 'bandpass', delay = 0) {
    if (!ctx) return;
    try {
      const t = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(master);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    } catch (e) {}
  }

  const fx = {
    key()     { noise(0.025, 0.12, 3000 + Math.random() * 1500, 'bandpass'); tone(180 + Math.random() * 40, 'square', 0.01, 0.02); },
    click()   { tone(950, 'sine', 0.03, 0.08); },
    scratch() { noise(0.03, 0.06, 2200 + Math.random() * 1500); },
    tick()    { noise(0.02, 0.15, 1400 + Math.random() * 400); tone(320 + Math.random() * 60, 'triangle', 0.02, 0.05); },
    snap()    { noise(0.3, 0.6, 2500); noise(0.15, 0.4, 5000, 'highpass', 0.02); tone(110, 'triangle', 0.25, 0.3); },
    unlock()  { noise(0.06, 0.35, 700); noise(0.05, 0.3, 400, 'bandpass', 0.09); [523, 659, 784].forEach((f, i) => tone(f, 'sine', 0.22, 0.12, 0.15 + i * 0.09)); },
    granted() { [784, 988, 1175].forEach((f, i) => tone(f, 'square', 0.09, 0.05, i * 0.08)); },
    denied()  { tone(220, 'square', 0.12, 0.06); tone(165, 'square', 0.18, 0.06, 0.12); },
    bracket() { [600, 900, 1200].forEach((f, i) => tone(f, 'triangle', 0.06, 0.07, i * 0.05)); },
    lockout() { tone(140, 'sawtooth', 0.6, 0.15); tone(70, 'sawtooth', 0.8, 0.15, 0.1); },
    win()     { [440, 554, 659, 880, 1109, 1319].forEach((f, i) => tone(f, 'sine', 0.3, 0.12, i * 0.11)); },
    good()    { [660, 990].forEach((f, i) => tone(f, 'sine', 0.18, 0.1, i * 0.09)); },
    fail()    { tone(120, 'sawtooth', 0.4, 0.15); tone(90, 'sawtooth', 0.5, 0.15, 0.05); },
  };

  function setEnabled(on) {
    enabled = on;
    localStorage.setItem('oz.sound', on ? 'on' : 'off');
    if (master) to(master.gain, on ? 1 : 0, 0.02);
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return {
    init, update, setEnabled, fx,
    get enabled() { return enabled; },
  };
})();

const Sound = AudioEngine.fx;

function vibrate(pattern) {
  if (AudioEngine.enabled && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}
