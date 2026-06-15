// ═══════════════════════════════════════════════
// СИСТЕМА ГЕНЕРАЦИИ АУТЕНТИЧНОГО ЗВУКА ROBCO AUDIO API
// ═══════════════════════════════════════════════
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playTone(freq, type, duration, vol = 0.1) {
  if (!audioCtx) return;
  try {
    let osc = audioCtx.createOscillator();
    let gainNode = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function playNoise(duration, vol = 0.1, isThud = false) {
  if (!audioCtx) return;
  try {
    let bufferSize = audioCtx.sampleRate * duration;
    let buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    let data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    let noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    
    let filter = audioCtx.createBiquadFilter();
    filter.type = isThud ? 'lowpass' : 'bandpass';
    filter.frequency.value = isThud ? 300 : 900;
    
    let gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    
    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    noiseSource.start();
  } catch(e) {}
}

const Sound = {
  click() { playTone(950, 'sine', 0.02, 0.08); },
  scratch() { playTone(150 + Math.random() * 250, 'triangle', 0.015, 0.04); },
  tension() { playTone(55 + Math.random() * 15, 'sawtooth', 0.06, 0.05); },
  snap() { 
    playNoise(0.25, 0.35, false); 
    playTone(110, 'triangle', 0.2, 0.3); 
  },
  success() {
    const now = audioCtx.currentTime;
    const notes = [440, 554, 659, 880, 1109];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 'sine', 0.25, 0.12), i * 110);
    });
  },
  fail() {
    playTone(120, 'sawtooth', 0.4, 0.2);
    playTone(90, 'sawtooth', 0.5, 0.2);
  }
};

// ═══════════════════════════════════════════════
// НАСТРОЙКИ СИСТЕМЫ И СОСТОЯНИЕ
// ═══════════════════════════════════════════════
const CFG = {
  HACK_MS: 2500,
  TICK_MS: 50,
  RED_LATEST: 85,
  INIT_PINS: 1,
};

const LEVELS = [
  { name: '[ СЕКТОР А: НИЗКАЯ ЗАЩИТА ]',  tol: 12.0 },
  { name: '[ СЕКТОР Б: СРЕДНЯЯ ЗАЩИТА ]', tol:  7.0 },
  { name: '[ СЕКТОР В: ВЫСШАЯ ЗАЩИТА ]', tol:  4.0 },
];

const S = {
  started: false, // Изначально игра не запущена
  level: 0,
  done: [false, false, false],
  finished: false,
  pins: CFG.INIT_PINS,
  modalOpen: false,
  angle: 0,
  target: 0,
  dragging: false,
  dragX0: 0,
  angleBase: 0,
  shakeX: 0, shakeY: 0, shakeAmt: 0, shakeT: 0,
  hacking: false,
  hackPct: 0,
  hackTimer: null,
  redStart: 100,
  usedQs: [],
  lastAngle: 0,

  tol() { return LEVELS[this.level].tol; },
  nextQuestion() {
    if (this.usedQs.length >= QUESTIONS.length) this.usedQs = [];
    let idx;
    do { idx = Math.floor(Math.random() * QUESTIONS.length); }
    while (this.usedQs.includes(idx));
    this.usedQs.push(idx);
    return QUESTIONS[idx];
  },
  newTarget() { this.target = (Math.random() * 150) - 75; }
};

// DOM ЭЛЕМЕНТЫ
const canvas = document.getElementById('lockCanvas');
const ctx = canvas.getContext('2d');
const hackBtn = document.getElementById('hackBtn');
const hackBar = document.getElementById('hackBar');
const hackTxt = document.getElementById('hackBtnText');
const lamp = document.getElementById('lamp');
const bobbyEl = document.getElementById('bobbyCount');
const getPinBtn = document.getElementById('getPinBtn');
const lvlTitle = document.getElementById('levelTitle');
const badges = [document.getElementById('badge0'), document.getElementById('badge1'), document.getElementById('badge2')];
const qOverlay = document.getElementById('questionOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalQ = document.getElementById('modalQ');
const modalOpts = document.getElementById('modalOpts');
const modalRes = document.getElementById('modalResult');
const modalCont = document.getElementById('modalContBtn');
const winOverlay = document.getElementById('winOverlay');
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');

// ОБНОВЛЕНИЕ ИНТЕРФЕЙСА
function updateBadges() {
  badges.forEach((b, i) => {
    b.className = 'level-badge';
    if (S.done[i]) b.classList.add('completed');
    else if (i === S.level) b.classList.add('active');
    else if (i > S.level) b.classList.add('locked');
  });
  lvlTitle.textContent = LEVELS[S.level].name;
}

function updatePins(bump) {
  bobbyEl.textContent = S.pins;
  if (bump) {
    bobbyEl.classList.remove('bump');
    void bobbyEl.offsetWidth;
    bobbyEl.classList.add('bump');
  }
}

function setLamp(state) {
  lamp.className = 'lamp';
  if (state) lamp.classList.add(state);
}

function setProgress(pct) { hackBar.style.width = pct + '%'; }

function updateButtons() {
  if (S.finished || S.modalOpen || !S.started) {
    hackBtn.disabled = true; getPinBtn.disabled = true; return;
  }
  hackBtn.disabled = S.pins <= 0 || S.done[S.level];
  getPinBtn.disabled = false;
  if (S.done[S.level] && !S.finished) canvas.classList.add('disabled-canvas');
  else canvas.classList.remove('disabled-canvas');
}

function calculateRedZone(diff, tol) {
  if (diff <= tol) return 100;
  const ratio = diff / tol;
  const normalized = Math.min((ratio - 1) / 8, 1);
  return Math.round(CFG.RED_LATEST - Math.sqrt(normalized) * (CFG.RED_LATEST - 2));
}

// РЕНДЕРИНГ МЕХАНИЗМА (CANVAS)
function drawFrame() {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = W * 0.44;

  if (S.dragging && Math.abs(S.angle - S.lastAngle) > 2) {
    Sound.scratch();
    S.lastAngle = S.angle;
  }

  if (S.hacking && S.hackPct >= S.redStart && S.redStart < 100) {
    S.shakeAmt = Math.min(S.shakeAmt + 0.4, 4.0);
    S.shakeT += 0.2;
    S.shakeX = Math.sin(S.shakeT * 20) * S.shakeAmt * 0.5;
    S.shakeY = Math.cos(S.shakeT * 22) * S.shakeAmt * 0.5;
  } else {
    S.shakeAmt *= 0.8;
    S.shakeX = S.shakeY = 0;
  }

  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.fillStyle = '#0a120a';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#225522';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(51,255,51,0.2)';
  for (let i = 0; i < 360; i += 10) {
    const rad = i * Math.PI / 180;
    const len = i % 30 === 0 ? 10 : 5;
    ctx.lineWidth = i % 30 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + (R - len) * Math.cos(rad), cy + (R - len) * Math.sin(rad));
    ctx.lineTo(cx + R * Math.cos(rad), cy + R * Math.sin(rad));
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  if (S.hacking && S.hackPct < S.redStart) {
    ctx.rotate((S.hackPct * 0.4) * Math.PI / 180);
  }
  ctx.fillStyle = '#112211';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#339933';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.fillStyle = '#020502';
  ctx.fillRect(-25, -5, 50, 10);
  ctx.restore();

  ctx.save();
  ctx.translate(cx + S.shakeX, cy + S.shakeY);
  ctx.rotate(S.angle * Math.PI / 180);

  if (S.shakeAmt > 1.5) ctx.rotate((Math.random() - 0.5) * S.shakeAmt * 0.015);

  ctx.strokeStyle = '#77aa66';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.1);
  ctx.lineTo(0, -R * 0.8);
  ctx.arc(4, -R * 0.8, 4, Math.PI, 0, false);
  ctx.lineTo(8, -R * 0.2);
  ctx.stroke();
  ctx.restore();
}

function animate() {
  drawFrame();
  requestAnimationFrame(animate);
}

// ОБРАБОТКА ДВИЖЕНИЯ СКРЕПКИ
function getXCoord(e) {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  return ((e.touches ? e.touches[0] : e).clientX - rect.left) * scale;
}

function dragStart(e) {
  if (S.finished || S.modalOpen || !S.started || S.done[S.level]) return;
  initAudio();
  e.preventDefault();
  S.dragging = true;
  S.dragX0 = getXCoord(e);
  S.angleBase = S.angle;
}

function dragMove(e) {
  if (!S.dragging || S.finished || S.modalOpen || S.done[S.level]) return;
  e.preventDefault();
  const dx = getXCoord(e) - S.dragX0;
  S.angle = Math.min(85, Math.max(-85, S.angleBase + dx * 0.6));
}

function dragEnd() { S.dragging = false; }

// АЛГОРИТМ ВЗЛОМА
function hackStart() {
  if (S.hacking || S.finished || S.modalOpen || S.done[S.level] || S.pins <= 0) return;
  initAudio();
  S.hacking = true;
  S.hackPct = 0;

  const diff = Math.abs(S.angle - S.target);
  S.redStart = calculateRedZone(diff, S.tol());
  getPinBtn.disabled = true;
  setLamp('active-green');

  S.hackTimer = setInterval(() => {
    S.hackPct += 100 / (CFG.HACK_MS / CFG.TICK_MS);
    
    if (S.hackPct >= 100) {
      S.hackPct = 100;
      clearInterval(S.hackTimer);
      hackComplete();
      return;
    }

    setProgress(S.hackPct);
    hackTxt.textContent = `ПРИВОД: ${Math.floor(S.hackPct)}%`;
    
    if (S.hackPct >= S.redStart && S.redStart < 100) {
      setLamp('red');
      Sound.tension();
      const force = ((S.hackPct - S.redStart) / (100 - S.redStart)) * 6;
      hackBtn.style.transform = `translate(${(Math.random()-.5)*force}px, ${(Math.random()-.5)*force}px)`;
    } else {
      Sound.click();
    }
  }, CFG.TICK_MS);
}

function hackCancel() {
  if (!S.hacking) return;
  clearInterval(S.hackTimer);
  S.hacking = false;
  hackReset();
}

function hackComplete() {
  S.hacking = false;
  const diff = Math.abs(S.angle - S.target);

  if (diff <= S.tol()) {
    S.done[S.level] = true;
    setProgress(100);
    hackTxt.textContent = 'СТРУКТУРА СЛОМАНА!';
    Sound.success();
    canvas.classList.add('success-glow');
    setTimeout(advanceLevel, 1500);
  } else {
    S.pins--;
    updatePins(false);
    setProgress(100);
    hackTxt.textContent = 'МЕТАЛЛ РАЗРУШЕН';
    Sound.snap();
    Sound.fail();
    canvas.classList.add('fail-glow');
    setLamp('red');

    // КОРРЕКЦИЯ: Окно с вопросом больше не открывается автоматически по таймауту.
    // Просто сбрасываем состояние взлома, давая игроку возможность нажать кнопку резерва вручную.
    setTimeout(() => {
      hackReset();
    }, 1000);
    return;
  }
}

function hackReset() {
  S.hacking = false;
  hackBtn.style.transform = '';
  setProgress(0);
  setLamp('');
  canvas.classList.remove('success-glow', 'fail-glow');
  if (!S.finished) hackTxt.textContent = 'ПОДАТЬ НАПРЯЖЕНИЕ (УДЕРЖД.)';
  updateButtons();
}

function advanceLevel() {
  canvas.classList.remove('success-glow', 'fail-glow');
  if (S.level + 1 < LEVELS.length) {
    S.level++;
    S.newTarget();
    S.angle = 0;
    updateBadges();
    hackReset();
  } else {
    S.finished = true;
    S.done = [true, true, true];
    updateBadges();
    hackReset();
    canvas.classList.add('disabled-canvas');
    winOverlay.classList.add('visible');
  }
}

// СИСТЕМА ВОПРОСОВ ИДЕНТИФИКАЦИИ
function openQuestion(fromBreak) {
  S.modalOpen = true;
  updateButtons();

  const q = S.nextQuestion();
  modalTitle.textContent = fromBreak ? '🚨 КРИТИЧЕСКИЙ СБОЙ МЕХАНИЗМА' : '❓ ЗАПРОС ИДЕНТИФИКАЦИИ';
  modalQ.textContent = q.text;
  modalOpts.innerHTML = '';
  modalRes.textContent = '';
  modalCont.style.display = 'none';

  let answered = false;

  q.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.textContent = `> ${opt}`;
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      Sound.click();

      const isCorrect = i === q.ok;
      document.querySelectorAll('.opt-btn').forEach((b, idx) => {
        b.disabled = true;
        if (idx === q.ok) b.classList.add('correct');
        else if (idx === i && !isCorrect) b.classList.add('wrong');
      });

      if (isCorrect) {
        S.pins++;
        updatePins(true);
        modalRes.textContent = 'ДОСТУП УТВЕРЖДЕН: ВЫДАН РЕЗЕРВНЫЙ КОМПЛЕКТ (+1 ТОКЕН)';
        modalRes.style.color = varToRGB('--green-bright');
        Sound.success();
      } else {
        modalRes.textContent = 'ОТКАЗАНО В ДОСТУПЕ: СИСТЕМА СТАБИЛИЗИРОВАНА';
        modalRes.style.color = varToRGB('--red-bright');
        Sound.fail();
      }
      modalCont.style.display = 'block';
    });
    modalOpts.appendChild(btn);
  });

  qOverlay.classList.add('visible');
}

function varToRGB(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function closeQuestion() {
  Sound.click();
  qOverlay.classList.remove('visible');
  S.modalOpen = false;
  hackReset();
}

// РЕГИСТРАЦИЯ ТРИГГЕРОВ СИСТЕМЫ
canvas.addEventListener('mousedown', dragStart);
window.addEventListener('mousemove', dragMove);
window.addEventListener('mouseup', dragEnd);
canvas.addEventListener('touchstart', dragStart, { passive: false });
canvas.addEventListener('touchmove', dragMove, { passive: false });
canvas.addEventListener('touchend', dragEnd, { passive: false });

hackBtn.addEventListener('mousedown', () => hackStart());
hackBtn.addEventListener('mouseup', () => hackCancel());
hackBtn.addEventListener('mouseleave', () => hackCancel());
hackBtn.addEventListener('touchstart', (e) => { e.preventDefault(); hackStart(); }, { passive: false });
hackBtn.addEventListener('touchend', (e) => { e.preventDefault(); hackCancel(); }, { passive: false });

getPinBtn.addEventListener('click', () => {
  initAudio();
  Sound.click();
  if (!S.finished && !S.modalOpen) openQuestion(false);
});

modalCont.addEventListener('click', closeQuestion);

startBtn.addEventListener('click', () => {
  initAudio(); // Инициализируем аудио-контекст по клику пользователя
  Sound.click();
  startOverlay.classList.remove('visible'); // Скрываем стартовый экран
  S.started = true; // Разрешаем игру
  updateButtons(); // Обновляем состояние игровых кнопок
});

// ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ ПУСТОШИ
S.newTarget();
updateBadges();
updatePins(false);
updateButtons();
animate();
