'use strict';

// ═══════════════════════════════════════════════
// РЕЖИМЫ
// ═══════════════════════════════════════════════
const L = (tol) => ({ type: 'lock', tol });
const T = (len, count) => ({ type: 'term', len, count });

const NORMAL_STAGES = [L(10), T(6, 12), L(6.5), T(7, 14), L(4)];

const DIFFS = {
  easy: {
    name: 'НОВИЧОК', picks: 3, scanners: 2, wearRate: 55,
    stages: [L(14), T(5, 10), L(9)],
    desc: '2 замка и терминал. 3 отмычки, 2 сканера.',
  },
  normal: {
    name: 'ВЗЛОМЩИК', picks: 2, scanners: 1, wearRate: 75,
    stages: NORMAL_STAGES,
    desc: '3 замка и 2 терминала. 2 отмычки, 1 сканер.',
  },
  hard: {
    name: 'МАСТЕР', picks: 1, scanners: 0, wearRate: 100,
    stages: [L(7), T(7, 14), L(4), T(8, 16), L(2.5)],
    desc: 'Узкие зоны, длинные пароли. 1 отмычка, без сканеров.',
  },
  alarm: {
    name: 'ТРЕВОГА', picks: 2, scanners: 1, wearRate: 75,
    stages: NORMAL_STAGES, timeLimit: 150000, timeBonus: 15000,
    desc: 'Как «Взломщик», но охрана уже в пути: 2:30 на всё, +15 с за каждый этап. Не успел — провал.',
  },
  endless: {
    name: 'БЕСКОНЕЧНЫЙ', picks: 2, scanners: 1, wearRate: 75, endless: true,
    desc: 'Этапы не кончаются и усложняются. Резерв даёт только сканеры, +1 отмычка за каждые 3 этапа. Сломана последняя — конец.',
  },
};

function endlessStage(n) {
  const k = Math.floor(n / 2);
  if (n % 2 === 0) return L(Math.max(1.8, Math.round((12 - k * 1.4) * 10) / 10));
  return T(Math.min(8, 5 + Math.floor(k / 2)), Math.min(16, 10 + k));
}

const CFG = {
  ROT_SPEED: 70,        // градусов поворота цилиндра в секунду
  RETURN_SPEED: 260,    // скорость возврата цилиндра
  OPEN_ANGLE: 90,       // угол, при котором замок открыт
  FALLOFF: 38,          // на сколько градусов за пределами зоны цилиндр перестаёт двигаться
  PICK_LIMIT: 88,
  DRAG_SENS: 0.55,
  REQ_COOLDOWN_BAD: 6,  // секунд блокировки резерва после неверного ответа
  REQ_COOLDOWN_GOOD: 20, // после верного ответа, если отмычки ещё есть
  TERM_LOCKOUT: 10,     // секунд перезагрузки терминала
  ENDLESS_LOCKOUT: 3,
  ENDLESS_PICK_EVERY: 3,
  ENDLESS_MAX_PICKS: 5,
};

const ACHIEVEMENTS = [
  { id: 'first',     name: 'ПЕРВЫЙ ДОСТУП', desc: 'Пройти любой взлом до конца' },
  { id: 'ghost',     name: 'ПРИЗРАК',       desc: 'Пройти взлом, не сломав ни одной отмычки' },
  { id: 'hacker',    name: 'ХАКЕР',         desc: 'Взломать терминал с первой попытки' },
  { id: 'master',    name: 'МАСТЕР',        desc: 'Пройти режим «Мастер»' },
  { id: 'speed',     name: 'СКОРОСТРЕЛ',    desc: 'Пройти «Взломщика» или «Мастера» быстрее 2 минут' },
  { id: 'alarm',     name: 'НЕУЛОВИМЫЙ',    desc: 'Уйти от охраны в режиме «Тревога»' },
  { id: 'endless10', name: 'МАРАФОН',       desc: 'Пройти 10 этапов в бесконечном режиме' },
  { id: 'erudite',   name: 'ЭРУДИТ',        desc: 'Дать 10 верных ответов на контрольные вопросы' },
  { id: 'brute',     name: 'ГРУБАЯ СИЛА',   desc: 'Сломать 10 отмычек' },
  { id: 'veteran',   name: 'ВЕТЕРАН',       desc: 'Пройти 10 взломов' },
];

// ═══════════════════════════════════════════════
// ХРАНИЛИЩЕ: профиль и настройки
// ═══════════════════════════════════════════════
const PROFILE_KEY = 'oz.profile';
const RUN_KEY = 'oz.run';
const SETTINGS_KEY = 'oz.settings';
const TUTORIAL_KEY = 'oz.tutorial';

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}

function emptyProfile() {
  return { runs: 0, finished: 0, locks: 0, terms: 0, broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0, playMs: 0, best: {}, history: [], ach: {} };
}

const P = Object.assign(emptyProfile(), loadJSON(PROFILE_KEY, {}));
['easy', 'normal', 'hard'].forEach((d) => {
  const old = loadJSON('oz.best.' + d, null);
  if (old && !P.best[d]) P.best[d] = old;
  localStorage.removeItem('oz.best.' + d);
});
function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(P)); }

const SETTINGS = Object.assign(
  { volume: 80, vibro: true, crt: true, typing: true, large: false, theme: 'green' },
  loadJSON(SETTINGS_KEY, {}),
);
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }

function unlock(id) {
  if (P.ach[id]) return false;
  P.ach[id] = Date.now();
  saveProfile();
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  toast(`★ ДОСТИЖЕНИЕ: ${a.name}`);
  log(`Достижение: ${a.name}`, 'good');
  Sound.good();
  return true;
}

// ═══════════════════════════════════════════════
// СОСТОЯНИЕ ВЗЛОМА
// ═══════════════════════════════════════════════
const S = {
  diff: localStorage.getItem('oz.diff') || 'normal',
  topics: loadJSON('oz.topics', Object.keys(QUESTION_TOPICS)),
  tab: 'hack',
  started: false,
  finished: false,
  paused: false,
  modalOpen: false,
  stages: [],
  stage: 0,
  done: [],
  cleared: 0,
  picks: 0,
  scanners: 0,
  scan: null,
  wear: 0,
  angle: 0,
  target: 0,
  rot: 0,
  turning: false,
  jammed: false,
  wasJammed: false,
  dragging: false,
  dragX0: 0,
  angleBase: 0,
  lastScratchAngle: 0,
  lastTickRot: 0,
  advancing: false,
  shake: 0,
  flash: 0,
  term: null,
  termLockLeft: 0,
  usedQs: [],
  cooldownLeft: 0,
  elapsed: 0,
  timeLeft: 0,
  stats: { broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 },
  journal: [],
};
if (!DIFFS[S.diff]) S.diff = 'normal';
let chosenDiff = S.diff; // режим, выбранный на стартовом экране для нового взлома

const cfg = () => DIFFS[S.diff];
const stageCfg = () => S.stages[S.stage];
const isLock = () => { const st = stageCfg(); return !st || st.type === 'lock'; };
const tol = () => stageCfg().tol;

function ensureStages(upto) {
  if (!cfg().endless) return;
  while (S.stages.length <= upto) S.stages.push(endlessStage(S.stages.length));
}

function stageLabel(i) {
  const st = S.stages;
  const n = st.slice(0, i + 1).filter((s) => s.type === st[i].type).length;
  return (st[i].type === 'lock' ? 'ЗАМОК ' : 'ТЕРМ ') + n;
}

function protectionName(t) {
  if (t >= 10) return 'НИЗКАЯ ЗАЩИТА';
  if (t >= 6) return 'СРЕДНЯЯ ЗАЩИТА';
  if (t >= 3.5) return 'ВЫСОКАЯ ЗАЩИТА';
  return 'ПРЕДЕЛЬНАЯ ЗАЩИТА';
}

// ═══════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const canvas = $('lockCanvas');
const ctx = canvas.getContext('2d');
const screenEl = $('screen');
const hackBtn = $('hackBtn');
const hackBar = $('hackBar');
const hackTxt = $('hackBtnText');
const lamp = $('lamp');
const pickCountEl = $('pickCount');
const wearBar = $('wearBar');
const getPinBtn = $('getPinBtn');
const scanBtn = $('scanBtn');
const lvlTitle = $('levelTitle');
const levelIndicator = $('levelIndicator');
const hintText = $('hintText');
const logEl = $('log');
const timerEl = $('timer');
const soundBtn = $('soundBtn');
const pauseBtn = $('pauseBtn');
const lockArea = $('lockArea');
const lockView = $('lockView');
const termView = $('termView');
const actionPanel = $('actionPanel');
const qOverlay = $('questionOverlay');
const modalTitle = $('modalTitle');
const modalQ = $('modalQ');
const modalOpts = $('modalOpts');
const modalRes = $('modalResult');
const modalRewards = $('modalRewards');
const modalCont = $('modalContBtn');
const pauseOverlay = $('pauseOverlay');
const winOverlay = $('winOverlay');
const startOverlay = $('startOverlay');
const startBtn = $('startBtn');
const continueBtn = $('continueBtn');
const restartBtn = $('restartBtn');
const bootLog = $('bootLog');
const bestLine = $('bestLine');
const toastEl = $('toast');

// ═══════════════════════════════════════════════
// ЦВЕТОВАЯ ТЕМА (для холстов)
// ═══════════════════════════════════════════════
const THEME = { pri: [51, 255, 51], acc: [255, 176, 0] };

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const parse = (v, d) => { const a = v.split(',').map((x) => parseFloat(x)); return a.length === 3 && a.every((x) => !isNaN(x)) ? a : d; };
  THEME.pri = parse(cs.getPropertyValue('--pri-rgb'), [51, 255, 51]);
  THEME.acc = parse(cs.getPropertyValue('--acc-rgb'), [255, 176, 0]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = cs.getPropertyValue('--bg-deep').trim() || '#020502';
}

// Оттенок основного цвета: k — яркость (0..1), a — прозрачность
function pri(k = 1, a = 1) {
  const [r, g, b] = THEME.pri;
  return `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;
}
function priLight(a = 1) {
  const [r, g, b] = THEME.pri;
  return `rgba(${Math.round(r + (255 - r) * 0.45)},${Math.round(g + (255 - g) * 0.45)},${Math.round(b + (255 - b) * 0.45)},${a})`;
}
function acc(a = 1) {
  const [r, g, b] = THEME.acc;
  return `rgba(${r},${g},${b},${a})`;
}

// ═══════════════════════════════════════════════
// ИНТЕРФЕЙС
// ═══════════════════════════════════════════════
function updateBadges() {
  let from = 0;
  let to = S.stages.length - 1;
  if (cfg().endless) {
    ensureStages(S.stage + 2);
    from = Math.max(0, S.stage - 2);
    to = from + 4;
    ensureStages(to);
  }
  levelIndicator.innerHTML = '';
  for (let i = from; i <= to; i++) {
    const b = document.createElement('div');
    b.className = 'level-badge ' + S.stages[i].type;
    b.textContent = stageLabel(i);
    if (S.done[i]) b.classList.add('completed');
    else if (i === S.stage) b.classList.add('active');
    else b.classList.add('locked');
    levelIndicator.appendChild(b);
  }
  const st = stageCfg();
  const prefix = cfg().endless ? `ЭТАП ${S.stage + 1} · ` : '';
  lvlTitle.textContent = st.type === 'lock'
    ? `[ ${prefix}${stageLabel(S.stage)}: ${protectionName(st.tol)} ]`
    : `[ ${prefix}ТЕРМИНАЛ ${stageLabel(S.stage).split(' ')[1]}: ПАРОЛЬ ИЗ ${st.len} БУКВ ]`;
}

function updatePicks(bump) {
  pickCountEl.textContent = S.picks;
  pickCountEl.classList.toggle('empty', S.picks <= 0);
  $('scanCount').textContent = S.scanners;
  if (bump) {
    pickCountEl.classList.remove('bump');
    void pickCountEl.offsetWidth;
    pickCountEl.classList.add('bump');
  }
}

function updateWear() {
  const hp = S.picks > 0 ? Math.max(0, 100 - S.wear) : 0;
  wearBar.style.width = hp + '%';
  wearBar.classList.toggle('low', hp < 35);
}

function setLamp(state) {
  lamp.className = 'lamp' + (state ? ' ' + state : '');
}

function log(msg, kind = '') {
  S.journal.push({ t: fmtTime(S.elapsed), m: msg, k: kind });
  if (S.journal.length > 200) S.journal.shift();
  renderLog();
  if (S.tab === 'data') renderData();
}

function renderLog() {
  logEl.innerHTML = '';
  S.journal.slice(-3).forEach((l) => {
    const line = document.createElement('div');
    line.className = 'log-line ' + l.k;
    line.textContent = '> ' + l.m;
    logEl.appendChild(line);
  });
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2600);
}

function blocked() {
  return S.finished || S.modalOpen || !S.started || S.advancing || S.paused;
}

function canScanNow() {
  if (blocked() || S.scanners <= 0) return false;
  if (isLock()) return !S.scan && S.picks > 0;
  return S.termLockLeft <= 0 && Terminal.canScan();
}

function updateButtons() {
  const b = blocked();
  hackBtn.disabled = b || S.picks <= 0 || !isLock();
  const cd = Math.ceil(S.cooldownLeft / 1000);
  getPinBtn.disabled = b || cd > 0;
  getPinBtn.textContent = cd > 0 ? `${cd}с` : '+ РЕЗЕРВ';
  getPinBtn.classList.toggle('attention', !getPinBtn.disabled && S.picks <= 0 && isLock() && !cfg().endless);
  scanBtn.disabled = !canScanNow();
  canvas.classList.toggle('disabled-canvas', b || S.picks <= 0);
  Terminal.setEnabled(!b && S.termLockLeft <= 0);
  pauseBtn.disabled = !S.started || S.finished;

  if (S.started && !S.finished && S.picks <= 0 && !S.modalOpen) {
    hintText.textContent = cfg().endless ? '[ ОТМЫЧЕК НЕТ ]' : '[ ОТМЫЧЕК НЕТ — ЗАПРОСИ РЕЗЕРВ ]';
  } else if (!S.turning) {
    hintText.textContent = '[ ТЯНИ ВЛЕВО / ВПРАВО ]';
  }
}

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function fmtLong(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} ч ${m % 60} мин` : `${m} мин ${Math.floor(ms / 1000) % 60} с`;
}

function updateTimer() {
  if (cfg().timeLimit) {
    timerEl.textContent = fmtTime(Math.ceil(S.timeLeft / 1000) * 1000);
    timerEl.classList.toggle('danger', S.timeLeft < 30000);
  } else {
    timerEl.textContent = fmtTime(S.elapsed);
    timerEl.classList.remove('danger');
  }
}

function updateSoundBtn() {
  soundBtn.textContent = AudioEngine.enabled ? '♪ ВКЛ' : '♪ ВЫКЛ';
  soundBtn.classList.toggle('off', !AudioEngine.enabled);
}

// ═══════════════════════════════════════════════
// ОБУЧЕНИЕ (подсказки при первом взломе)
// ═══════════════════════════════════════════════
const coachEl = $('coach');
const Tutorial = {
  active: false,
  step: null,
  target: null,
  seen: {},
  dragFrom: 0,

  start() {
    this.active = localStorage.getItem(TUTORIAL_KEY) !== 'done';
    this.seen = {};
    this.hide();
  },

  show(id, target, html, ok = false) {
    if (!this.active || this.seen[id]) return;
    this.hide();
    this.seen[id] = true;
    this.step = id;
    this.target = target;
    $('coachText').innerHTML = html;
    $('coachOk').hidden = !ok;
    coachEl.hidden = false;
    target.classList.add('coach-target');
    this.position();
  },

  done(id) { if (this.step === id) this.hide(); },

  hide() {
    if (this.target) this.target.classList.remove('coach-target');
    this.step = null;
    this.target = null;
    coachEl.hidden = true;
  },

  finish() {
    if (!this.active) return;
    this.active = false;
    this.hide();
    localStorage.setItem(TUTORIAL_KEY, 'done');
  },

  position() {
    if (!this.target || coachEl.hidden) return;
    const r = this.target.getBoundingClientRect();
    const c = coachEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top;
    if (r.bottom + 10 + c.height < vh) top = r.bottom + 10;
    else if (r.top - 10 - c.height > 0) top = r.top - 10 - c.height;
    else top = vh - c.height - 10;
    const left = Math.max(8, Math.min(vw - c.width - 8, r.left + r.width / 2 - c.width / 2));
    coachEl.style.top = top + 'px';
    coachEl.style.left = left + 'px';
  },
};

$('coachOk').addEventListener('click', () => { Sound.click(); Tutorial.hide(); });
// Информационные подсказки закрываются нажатием в любом другом месте
document.addEventListener('pointerdown', (e) => {
  if (!coachEl.hidden && !$('coachOk').hidden && !coachEl.contains(e.target)) Tutorial.hide();
}, true);
$('coachSkip').addEventListener('click', () => { Sound.click(); Tutorial.finish(); toast('Обучение пропущено'); });

function tutorialForStage() {
  if (!Tutorial.active) return;
  if (isLock() && !Tutorial.seen.drag) {
    Tutorial.dragFrom = S.angle;
    Tutorial.show('drag', canvas, 'Тяни по замку <b>влево-вправо</b> — так двигается отмычка. На клавиатуре — стрелки ← →.');
  } else if (!isLock() && !Tutorial.seen.term1) {
    Tutorial.show('term1', termView, 'Это дамп памяти. Среди мусора спрятаны слова — одно из них пароль. <b>Выбери любое слово</b> (на телефоне — двойной тап).');
  }
}

// ═══════════════════════════════════════════════
// ЭТАПЫ
// ═══════════════════════════════════════════════
function newTarget() {
  let t;
  do { t = Math.random() * 160 - 80; } while (Math.abs(t) < tol() * 1.5);
  S.target = t;
}

function enterStage(fresh) {
  S.rot = 0;
  S.turning = false;
  S.jammed = false;
  if (isLock()) {
    if (fresh) { S.angle = 0; S.scan = null; newTarget(); }
    S.term = null;
  } else if (fresh || !S.term) {
    const st = stageCfg();
    S.term = Terminal.create({ len: st.len, count: st.count });
    S.termLockLeft = 0;
    S.scan = null;
  }
  renderStage();
}

function renderStage() {
  const lock = isLock();
  lockView.hidden = !lock;
  termView.hidden = lock;
  actionPanel.classList.toggle('hidden', !lock);
  hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)';
  hackBar.style.width = '0%';
  setLamp('');
  if (lock) {
    resizeCanvas();
  } else {
    Terminal.mount(termView, S.term, {
      sound: (n) => Sound[n] && Sound[n](),
      onSolved: termSolved,
      onLockout: termLockout,
      onChange: termChanged,
    });
    Terminal.showLock(S.termLockLeft / 1000);
  }
  updateBadges();
  updateButtons();
}

function completeStage(msg) {
  S.advancing = true;
  S.done[S.stage] = true;
  S.cleared++;
  updateBadges();
  log(msg, 'good');
  if (cfg().timeLimit) {
    S.timeLeft += cfg().timeBonus;
    toast(`+${cfg().timeBonus / 1000} С ДО ПРИБЫТИЯ ОХРАНЫ`);
  }
  if (cfg().endless) {
    if (S.cleared % CFG.ENDLESS_PICK_EVERY === 0 && S.picks < CFG.ENDLESS_MAX_PICKS) {
      S.picks++;
      if (S.picks === 1) S.wear = 0;
      updatePicks(true);
      updateWear();
      log('Найдена отмычка: +1.', 'good');
    }
    if (S.cleared >= 10) unlock('endless10');
  }
  updateButtons();
  saveRun();
  setTimeout(nextStage, 1300);
}

function nextStage() {
  canvas.classList.remove('success-glow');
  S.advancing = false;
  if (S.finished) return;
  ensureStages(S.stage + 1);
  if (S.stage + 1 < S.stages.length) {
    S.stage++;
    enterStage(true);
    log(isLock() ? `${stageLabel(S.stage)}: допуск ±${tol()}°.` : `Терминал: пароль из ${stageCfg().len} букв.`);
    tutorialForStage();
    saveRun();
  } else {
    endGame(true);
  }
}

// ─── Замок ───────────────────────────────────
function maxRotation() {
  const diff = Math.abs(S.angle - S.target);
  if (diff <= tol()) return CFG.OPEN_ANGLE;
  const k = Math.max(0, 1 - (diff - tol()) / CFG.FALLOFF);
  return CFG.OPEN_ANGLE * 0.85 * k;
}

function turnStart() {
  if (S.turning || blocked() || S.picks <= 0 || !isLock() || S.tab !== 'hack') return;
  AudioEngine.init();
  S.turning = true;
  S.wasJammed = false;
  S.dragging = false;
  hackBtn.classList.add('pressed');
  setLamp('active-green');
  hintText.textContent = '[ ДЕРЖИ... ]';
  Tutorial.done('turn');
}

function turnStop() {
  if (!S.turning) return;
  S.turning = false;
  S.jammed = false;
  hackBtn.classList.remove('pressed');
  hackBtn.style.transform = '';
  if (!S.advancing) setLamp('');
  if (S.wasJammed && Tutorial.step === 'jam') {
    Tutorial.done('jam');
    Tutorial.show('search', S.scanners > 0 ? scanBtn : lockArea,
      'Чем дальше проворачивается цилиндр, тем ближе отмычка к цели. <b>Сдвинь её</b> и попробуй снова.' +
      (S.scanners > 0 ? ' Застрял — нажми <b>⌖</b>: сканер подсветит зону на шкале.' : ''), true);
  }
  updateButtons();
  saveRun();
}

function breakPick() {
  S.picks--;
  S.wear = 0;
  S.stats.broken++;
  P.broken++;
  S.rot = 0;
  S.flash = -1;
  turnStop();
  updatePicks(true);
  updateWear();
  Sound.snap();
  vibrate([60, 40, 120]);
  screenEl.classList.remove('hit');
  void screenEl.offsetWidth;
  screenEl.classList.add('hit');
  setLamp('red');
  setTimeout(() => { if (!S.turning) setLamp(''); }, 600);
  hackTxt.textContent = 'ОТМЫЧКА СЛОМАНА';
  setTimeout(() => { if (!S.turning && !S.advancing) hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)'; }, 1100);
  if (P.broken >= 10) unlock('brute');
  saveProfile();
  if (cfg().endless && S.picks <= 0) {
    log('Последняя отмычка сломана.', 'bad');
    S.advancing = true;
    updateButtons();
    setTimeout(() => endGame(false, 'picks'), 900);
    return;
  }
  log(S.picks > 0 ? `Отмычка сломана. Осталось: ${S.picks}` : 'Последняя отмычка сломана. Нужен резерв.', 'bad');
  updateButtons();
  saveRun();
}

function unlockLock() {
  S.flash = 1;
  turnStop();
  setLamp('active-green');
  Sound.unlock();
  vibrate(40);
  hackTxt.textContent = 'ЗАМОК ОТКРЫТ!';
  canvas.classList.add('success-glow');
  P.locks++;
  saveProfile();
  Tutorial.hide();
  completeStage(`${stageLabel(S.stage)} вскрыт.`);
}

// ─── Терминал ────────────────────────────────
function termChanged(t) {
  if (t.wrong > 0 && Tutorial.step === 'term1') {
    Tutorial.done('term1');
    Tutorial.show('term2', termView,
      '«Совпадение» — сколько букв стоят <b>на своих местах</b>. Ищи слово с теми же буквами на тех же позициях. ' +
      '<b>Парные скобки</b> в одной строке — (…) […] {…} &lt;…&gt; — убирают ложные слова.', true);
  }
  updateButtons();
  saveRun();
}

function termSolved(t) {
  Sound.granted();
  vibrate(40);
  P.terms++;
  if (t.wrong === 0) unlock('hacker');
  saveProfile();
  Tutorial.finish();
  completeStage('Терминал взломан.');
}

function termLockout() {
  S.stats.lockouts++;
  P.lockouts++;
  saveProfile();
  Sound.lockout();
  vibrate([100, 50, 100]);
  if (cfg().endless) {
    S.picks = Math.max(0, S.picks - 1);
    S.wear = 0;
    updatePicks(true);
    updateWear();
    if (S.picks <= 0) {
      log('Терминал заблокирован. Отмычек не осталось.', 'bad');
      S.advancing = true;
      updateButtons();
      setTimeout(() => endGame(false, 'picks'), 900);
      return;
    }
    log(`Терминал заблокирован: −1 отмычка. Осталось: ${S.picks}.`, 'bad');
    S.termLockLeft = CFG.ENDLESS_LOCKOUT * 1000;
  } else {
    S.termLockLeft = CFG.TERM_LOCKOUT * 1000;
    log(`Терминал заблокирован. Перезагрузка ${CFG.TERM_LOCKOUT} с.`, 'bad');
  }
  Terminal.showLock(S.termLockLeft / 1000);
  updateButtons();
  saveRun();
}

function termReboot() {
  const st = stageCfg();
  S.term = Terminal.create({ len: st.len, count: st.count });
  S.termLockLeft = 0;
  renderStage();
  log('Терминал перезагружен. Новый пароль.');
  saveRun();
}

// ─── Сканер ──────────────────────────────────
function useScanner() {
  if (!canScanNow()) return;
  AudioEngine.init();
  if (isLock()) {
    const width = Math.max(20, tol() * 2 + 18);
    const slack = width - tol() * 2;
    let a = S.target - tol() - Math.random() * slack;
    a = Math.max(-CFG.PICK_LIMIT, Math.min(CFG.PICK_LIMIT - width, a));
    S.scan = [a, a + width];
    log('Сканер: зона поиска подсвечена.', 'good');
  } else if (!Terminal.scan()) {
    return;
  } else {
    log('Сканер: ложное слово удалено.', 'good');
  }
  S.scanners--;
  S.stats.scans++;
  P.scans++;
  saveProfile();
  Sound.scan();
  vibrate(20);
  updatePicks(false);
  updateButtons();
  saveRun();
}
scanBtn.addEventListener('click', useScanner);

// ═══════════════════════════════════════════════
// ИГРОВОЙ ЦИКЛ
// ═══════════════════════════════════════════════
let saveAcc = 0;
let lastBeep = 0;

function update(dt) {
  AudioEngine.update({ turning: S.turning, rot: S.rot, jammed: S.jammed, wear: S.wear });
  Tutorial.position();

  const active = S.started && !S.finished && S.tab === 'hack' && !S.paused;
  if (!active) return;

  S.elapsed += dt * 1000;
  P.playMs += dt * 1000;
  if (cfg().timeLimit && !S.advancing) {
    S.timeLeft -= dt * 1000;
    const sec = Math.ceil(S.timeLeft / 1000);
    if (sec <= 10 && sec > 0 && sec !== lastBeep) { lastBeep = sec; Sound.beep(); }
    if (S.timeLeft <= 0) { S.timeLeft = 0; updateTimer(); endGame(false, 'time'); return; }
  }
  updateTimer();

  saveAcc += dt;
  if (saveAcc > 3) { saveAcc = 0; saveRun(); saveProfile(); }

  if (S.cooldownLeft > 0) {
    const before = Math.ceil(S.cooldownLeft / 1000);
    S.cooldownLeft = Math.max(0, S.cooldownLeft - dt * 1000);
    if (Math.ceil(S.cooldownLeft / 1000) !== before) updateButtons();
  }

  if (S.termLockLeft > 0) {
    S.termLockLeft -= dt * 1000;
    Terminal.showLock(S.termLockLeft / 1000);
    if (S.termLockLeft <= 0) termReboot();
  }

  if (!isLock()) return;

  if (S.turning) {
    const limit = maxRotation();
    if (S.rot < limit) {
      S.rot = Math.min(limit, S.rot + CFG.ROT_SPEED * dt);
      S.jammed = false;
    }
    if (S.rot >= CFG.OPEN_ANGLE) { unlockLock(); return; }
    if (S.rot >= limit - 0.01) {
      if (!S.jammed) {
        S.jammed = true;
        S.wasJammed = true;
        setLamp('red');
        hintText.textContent = '[ ЗАКЛИНИЛО! ОТПУСТИ! ]';
        vibrate(30);
        Tutorial.show('jam', hackBtn, 'Заклинило! <b>Отпусти кнопку</b>, пока отмычка не сломалась.');
      }
      // Во время обучения первая отмычка не изнашивается
      if (!(Tutorial.active && S.stage === 0)) S.wear += cfg().wearRate * dt;
      const f = 1 + S.wear / 25;
      hackBtn.style.transform = `translate(${(Math.random() - .5) * f}px, ${(Math.random() - .5) * f}px)`;
      updateWear();
      if (S.wear >= 100) { breakPick(); return; }
    }
    if (S.rot - S.lastTickRot > 6) { Sound.tick(); S.lastTickRot = S.rot; }
  } else if (S.rot > 0 && !S.advancing) {
    S.rot = Math.max(0, S.rot - CFG.RETURN_SPEED * dt);
    S.lastTickRot = S.rot;
  }

  const shakeMax = SETTINGS.crt ? 3 + S.wear / 30 : 1.5;
  S.shake = S.jammed ? Math.min(S.shake + dt * 12, shakeMax) : S.shake * 0.82;
  if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 1.2);
  if (S.flash < 0) S.flash = Math.min(0, S.flash + dt * 2);

  const pct = Math.min(100, S.rot / CFG.OPEN_ANGLE * 100);
  hackBar.style.width = pct + '%';
  hackBar.classList.toggle('jam', S.jammed);
  if (S.turning) hackTxt.textContent = `ЦИЛИНДР: ${Math.floor(pct)}%`;
  else if (!S.advancing && hackTxt.textContent.startsWith('ЦИЛИНДР')) hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)';
}

// ═══════════════════════════════════════════════
// ОТРИСОВКА ЗАМКА
// ═══════════════════════════════════════════════
const VIEW = 240;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const css = canvas.getBoundingClientRect().width || VIEW;
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
}

function drawFrame(now) {
  const scale = canvas.width / VIEW;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, VIEW, VIEW);

  const cx = VIEW / 2, cy = VIEW / 2, R = VIEW * 0.46;
  const sx = (Math.random() - 0.5) * S.shake;
  const sy = (Math.random() - 0.5) * S.shake;
  const rotRad = S.rot * Math.PI / 180;
  const flashCol = priLight(0.4 + Math.max(0, S.flash) * 0.6);

  // Корпус
  const body = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, R);
  body.addColorStop(0, pri(0.12));
  body.addColorStop(1, pri(0.035));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = pri(0.35); ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = pri(1, 0.08); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R - 7, 0, Math.PI * 2); ctx.stroke();

  // Зона сканера
  if (S.scan) {
    const pulse = 0.35 + 0.2 * Math.sin(now / 250);
    ctx.strokeStyle = acc(pulse);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 15, (S.scan[0] - 90) * Math.PI / 180, (S.scan[1] - 90) * Math.PI / 180);
    ctx.stroke();
  }

  // Шкала
  for (let a = -90; a <= 90; a += 5) {
    const rad = (a - 90) * Math.PI / 180;
    const big = a % 30 === 0;
    const len = big ? 10 : a % 15 === 0 ? 6 : 3;
    ctx.strokeStyle = pri(1, big ? 0.45 : 0.2);
    ctx.lineWidth = big ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + (R - 10 - len) * Math.cos(rad), cy + (R - 10 - len) * Math.sin(rad));
    ctx.lineTo(cx + (R - 10) * Math.cos(rad), cy + (R - 10) * Math.sin(rad));
    ctx.stroke();
  }

  // Болты
  ctx.fillStyle = pri(0.2);
  ctx.strokeStyle = pri(0.42);
  [45, 135].forEach((deg) => {
    const r = deg * Math.PI / 180;
    const bx = cx + (R - 16) * Math.cos(r), by = cy + (R - 16) * Math.sin(r);
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx + 3, by); ctx.stroke();
  });

  // Цилиндр
  ctx.save();
  ctx.translate(cx + sx * 0.4, cy + sy * 0.4);
  ctx.rotate(rotRad);
  const cylR = R * 0.5;
  const cyl = ctx.createRadialGradient(-10, -10, 4, 0, 0, cylR);
  cyl.addColorStop(0, pri(0.23));
  cyl.addColorStop(1, pri(0.09));
  ctx.fillStyle = cyl;
  ctx.beginPath(); ctx.arc(0, 0, cylR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = S.flash > 0 ? flashCol : pri(0.56);
  ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = pri(1, 0.12); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, cylR - 6, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = pri(1, 0.5);
  ctx.fillRect(-1.5, -cylR + 2, 3, 7);
  ctx.fillStyle = '#010201';
  ctx.beginPath();
  ctx.arc(0, -6, 8, 0, Math.PI * 2);
  ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.lineTo(6, 20); ctx.lineTo(-6, 20); ctx.closePath();
  ctx.fill();
  // Натяжитель
  ctx.strokeStyle = '#7d847a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, R * 0.62); ctx.lineTo(R * 0.3, R * 0.75); ctx.stroke();
  ctx.strokeStyle = '#bcc2b8'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-1, 16); ctx.lineTo(-1, R * 0.6); ctx.stroke();
  ctx.restore();

  // Отмычка
  if (S.picks > 0 || S.flash < 0) {
    ctx.save();
    ctx.translate(cx + sx, cy - 6 + sy);
    ctx.rotate(S.angle * Math.PI / 180 + (S.jammed ? (Math.random() - 0.5) * 0.03 * S.shake : 0));
    const len = R * 0.92;
    const broken = S.flash < 0;
    ctx.globalAlpha = broken ? Math.max(0, 1 + S.flash * 2) : 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(1, 2); ctx.lineTo(1, -len + 2); ctx.stroke();
    const w = Math.min(1, S.wear / 100);
    ctx.strokeStyle = `rgb(${Math.round(175 + 70 * w)}, ${Math.round(182 - 85 * w)}, ${Math.round(172 - 110 * w)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, broken ? -len * 0.45 : -len + 6);
    if (!broken) ctx.arc(5, -len + 6, 5, Math.PI, Math.PI * 1.9, false);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-1, broken ? -len * 0.4 : -len + 10); ctx.stroke();
    ctx.restore();
  }

  if (S.flash > 0) {
    ctx.strokeStyle = flashCol;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2); ctx.stroke();
  }
}

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  if (!lockView.hidden && S.tab === 'hack') drawFrame(now);
  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════
// УПРАВЛЕНИЕ
// ═══════════════════════════════════════════════
function canMovePick() {
  return !blocked() && !S.turning && S.picks > 0 && S.rot < 1 && isLock();
}

function setAngle(a) {
  S.angle = Math.max(-CFG.PICK_LIMIT, Math.min(CFG.PICK_LIMIT, a));
  if (Math.abs(S.angle - S.lastScratchAngle) > 3) {
    Sound.scratch();
    S.lastScratchAngle = S.angle;
  }
  if (Tutorial.step === 'drag' && Math.abs(S.angle - Tutorial.dragFrom) > 12) {
    Tutorial.done('drag');
    Tutorial.show('turn', hackBtn, 'Теперь <b>зажми и держи</b> «ПРОВЕРНУТЬ» (или пробел). Смотри, насколько провернётся цилиндр.');
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (!canMovePick()) return;
  AudioEngine.init();
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  S.dragging = true;
  S.dragX0 = e.clientX;
  S.angleBase = S.angle;
});
canvas.addEventListener('pointermove', (e) => {
  if (!S.dragging) return;
  if (!canMovePick()) { S.dragging = false; return; }
  const rect = canvas.getBoundingClientRect();
  const dx = (e.clientX - S.dragX0) * (VIEW / rect.width);
  setAngle(S.angleBase + dx * CFG.DRAG_SENS);
});
const endDrag = () => { if (S.dragging) { S.dragging = false; saveRun(); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

hackBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); turnStart(); });
hackBtn.addEventListener('pointerup', turnStop);
hackBtn.addEventListener('pointerleave', turnStop);
hackBtn.addEventListener('pointercancel', turnStop);
hackBtn.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', turnStop);

const keysHeld = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.target.matches && e.target.matches('input')) return;

  if (S.modalOpen) {
    const n = parseInt(e.key, 10);
    if (!modalRewards.hidden) {
      const rb = modalRewards.querySelectorAll('.reward-btn');
      if (n >= 1 && n <= rb.length) rb[n - 1].click();
      return;
    }
    const btns = modalOpts.querySelectorAll('.opt-btn');
    if (n >= 1 && n <= btns.length && !btns[n - 1].disabled) btns[n - 1].click();
    else if ((e.key === 'Enter' || e.key === ' ') && modalCont.style.display === 'block') { e.preventDefault(); modalCont.click(); }
    return;
  }
  if (S.paused) {
    if (e.key === 'Escape' || e.key === 'Enter' || k === 'p' || k === 'з') { e.preventDefault(); resumeGame(); }
    return;
  }
  if (startOverlay.classList.contains('visible')) {
    if (e.key === 'Enter') { e.preventDefault(); (continueBtn.hidden ? startBtn : continueBtn).click(); }
    return;
  }
  if (S.finished) {
    if (e.key === 'Enter' && winOverlay.classList.contains('visible')) restartBtn.click();
    return;
  }
  if (k === 'm' || k === 'ь') { toggleSound(); return; }
  if (e.key === 'Escape' || k === 'p' || k === 'з') { pauseGame(); return; }
  if (S.tab !== 'hack') return;
  if ((k === 's' || k === 'ы') && !scanBtn.disabled) { useScanner(); return; }
  if ((k === 'r' || k === 'к') && !getPinBtn.disabled) { getPinBtn.click(); return; }

  if (!isLock()) {
    AudioEngine.init();
    Terminal.handleKey(e);
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (canMovePick()) {
      AudioEngine.init();
      const step = (e.shiftKey ? 0.5 : 2) * (e.key === 'ArrowLeft' ? -1 : 1);
      setAngle(S.angle + step);
    }
    return;
  }
  if (e.key === ' ' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!keysHeld.has(e.key)) { keysHeld.add(e.key); turnStart(); }
  }
});
window.addEventListener('keyup', (e) => {
  if (keysHeld.delete(e.key) && keysHeld.size === 0) turnStop();
});

// ═══════════════════════════════════════════════
// ПАУЗА
// ═══════════════════════════════════════════════
function pauseGame() {
  if (!S.started || S.finished || S.paused || S.modalOpen) return;
  turnStop();
  S.paused = true;
  const st = cfg().endless ? `ЭТАП ${S.stage + 1}` : `ЭТАП ${S.stage + 1}/${S.stages.length}`;
  $('pauseInfo').textContent = `${cfg().name} · ${st} · ${cfg().timeLimit ? 'ОСТАЛОСЬ ' + fmtTime(S.timeLeft) : fmtTime(S.elapsed)}`;
  pauseOverlay.classList.add('visible');
  Terminal.setEnabled(false);
  updateButtons();
  saveRun();
}

function resumeGame() {
  if (!S.paused) return;
  Sound.click();
  S.paused = false;
  pauseOverlay.classList.remove('visible');
  lastT = performance.now();
  updateButtons();
}

pauseBtn.addEventListener('click', () => { AudioEngine.init(); Sound.click(); pauseGame(); });
$('resumeBtn').addEventListener('click', resumeGame);
$('pauseCfgBtn').addEventListener('click', () => { resumeGame(); switchTab('cfg'); });
$('pauseMenuBtn').addEventListener('click', () => {
  saveRun();
  S.paused = false;
  pauseOverlay.classList.remove('visible');
  Tutorial.hide();
  showStartScreen();
});

// ═══════════════════════════════════════════════
// КОНТРОЛЬНЫЕ ВОПРОСЫ / РЕЗЕРВ
// ═══════════════════════════════════════════════
function nextQuestion() {
  const pool = QUESTIONS.map((q, i) => i).filter((i) => S.topics.includes(QUESTIONS[i].cat));
  let fresh = pool.filter((i) => !S.usedQs.includes(i));
  if (!fresh.length) { S.usedQs = S.usedQs.filter((i) => !pool.includes(i)); fresh = pool; }
  const idx = fresh[Math.floor(Math.random() * fresh.length)];
  S.usedQs.push(idx);
  return QUESTIONS[idx];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function grantReward(kind) {
  if (kind === 'pick') {
    S.picks++;
    if (S.picks === 1) S.wear = 0;
    updateWear();
    log('Резерв выдан: +1 отмычка.', 'good');
    modalRes.textContent = 'ВЫДАНА ОТМЫЧКА (+1)';
  } else {
    S.scanners++;
    log('Резерв выдан: +1 сканер.', 'good');
    modalRes.textContent = 'ВЫДАН СКАНЕР (+1)';
  }
  updatePicks(true);
  // Перезарядка резерва, если игрок не остался совсем без отмычек
  S.cooldownLeft = (S.picks > 0 || cfg().endless) ? CFG.REQ_COOLDOWN_GOOD * 1000 : 0;
  Sound.good();
  saveRun();
}

function openQuestion() {
  S.modalOpen = true;
  turnStop();
  updateButtons();

  const q = nextQuestion();
  const opts = shuffle(q.opts.map((text, i) => ({ text, ok: i === q.ok })));

  modalTitle.textContent = `ЗАПРОС ИДЕНТИФИКАЦИИ // ${QUESTION_TOPICS[q.cat]}`;
  modalQ.textContent = q.text;
  modalOpts.innerHTML = '';
  modalRes.textContent = '';
  modalRes.className = 'modal-result';
  modalRewards.hidden = true;
  modalCont.style.display = 'none';

  let answered = false;
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.innerHTML = `<span class="opt-key">${i + 1}</span>`;
    btn.appendChild(document.createTextNode(opt.text));
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      modalOpts.querySelectorAll('.opt-btn').forEach((b, idx) => {
        b.disabled = true;
        if (opts[idx].ok) b.classList.add('correct');
        else if (idx === i) b.classList.add('wrong');
      });
      if (opt.ok) {
        S.stats.right++;
        P.right++;
        modalRes.classList.add('good');
        if (P.right >= 10) unlock('erudite');
        if (cfg().endless) {
          grantReward('scan');
          showContinue();
        } else {
          modalRes.textContent = 'ДОСТУП ПОДТВЕРЖДЁН. ВЫБЕРИ РЕЗЕРВ:';
          modalRewards.hidden = false;
          Sound.good();
        }
      } else {
        S.stats.wrong++;
        P.wrong++;
        S.cooldownLeft = CFG.REQ_COOLDOWN_BAD * 1000;
        modalRes.textContent = `ОТКАЗАНО. ПОВТОРНЫЙ ЗАПРОС ЧЕРЕЗ ${CFG.REQ_COOLDOWN_BAD} С`;
        modalRes.classList.add('bad');
        Sound.fail();
        log('Идентификация провалена.', 'bad');
        showContinue();
      }
      saveProfile();
      saveRun();
    });
    modalOpts.appendChild(btn);
  });

  qOverlay.classList.add('visible');
}

function showContinue() {
  modalCont.style.display = 'block';
  modalCont.focus({ preventScroll: true });
}

modalRewards.querySelectorAll('.reward-btn').forEach((b) => b.addEventListener('click', () => {
  if (modalRewards.hidden) return;
  modalRewards.hidden = true;
  grantReward(b.dataset.reward);
  showContinue();
}));

function closeQuestion() {
  Sound.click();
  qOverlay.classList.remove('visible');
  S.modalOpen = false;
  lastT = performance.now();
  updateButtons();
}

getPinBtn.addEventListener('click', () => {
  AudioEngine.init();
  Sound.click();
  if (!blocked() && S.cooldownLeft <= 0) openQuestion();
});
modalCont.addEventListener('click', closeQuestion);

// ═══════════════════════════════════════════════
// СОХРАНЕНИЕ ПРОГРЕССА
// ═══════════════════════════════════════════════
function saveRun() {
  if (!S.started || S.finished) return;
  const data = {
    v: 3,
    diff: S.diff,
    stages: S.stages,
    stage: S.stage,
    done: S.done,
    cleared: S.cleared,
    picks: S.picks,
    scanners: S.scanners,
    scan: S.scan,
    wear: S.wear,
    angle: S.angle,
    target: S.target,
    term: S.term,
    termLockLeft: S.termLockLeft,
    usedQs: S.usedQs,
    cooldownLeft: S.cooldownLeft,
    elapsed: S.elapsed,
    timeLeft: S.timeLeft,
    stats: S.stats,
    journal: S.journal.slice(-100),
    tutorial: Tutorial.active ? Tutorial.seen : null,
    saved: Date.now(),
  };
  if (S.advancing) data.advancing = true;
  try { localStorage.setItem(RUN_KEY, JSON.stringify(data)); } catch (e) {}
}

function clearRun() { localStorage.removeItem(RUN_KEY); }

function loadRun() {
  const r = loadJSON(RUN_KEY, null);
  if (!r || (r.v !== 2 && r.v !== 3) || !DIFFS[r.diff]) return null;
  return r;
}

function applyRun(r) {
  const m = DIFFS[r.diff];
  S.diff = r.diff;
  S.started = false;
  S.finished = false;
  S.paused = false;
  S.stages = r.stages || (m.stages || []).slice();
  S.stage = r.stage;
  S.done = r.done;
  S.cleared = r.cleared != null ? r.cleared : r.done.filter(Boolean).length;
  S.picks = r.picks;
  S.scanners = r.scanners != null ? r.scanners : m.scanners;
  S.scan = r.scan || null;
  S.wear = r.wear;
  S.angle = r.angle;
  S.target = r.target;
  S.term = r.term;
  S.termLockLeft = r.termLockLeft || 0;
  S.usedQs = r.usedQs || [];
  S.cooldownLeft = r.cooldownLeft || 0;
  S.elapsed = r.elapsed || 0;
  S.timeLeft = r.timeLeft != null ? r.timeLeft : (m.timeLimit || 0);
  S.stats = Object.assign({ broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 }, r.stats);
  S.journal = r.journal || [];
  S.advancing = false;
  ensureStages(S.stage + 2);
  updatePicks(false);
  updateWear();
  updateTimer();
  renderLog();
  if (r.advancing && S.done[S.stage]) {
    if (S.stage + 1 < S.stages.length) { S.stage++; enterStage(true); }
    else { enterStage(false); }
  } else {
    enterStage(false);
  }
  return r;
}

window.addEventListener('pagehide', () => { saveRun(); saveProfile(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    turnStop();
    if (S.tab === 'hack') pauseGame();
    saveRun();
    saveProfile();
  }
});

// ═══════════════════════════════════════════════
// СТАРТ / ФИНАЛ
// ═══════════════════════════════════════════════
function resetGame() {
  S.diff = chosenDiff;
  const m = cfg();
  S.started = false;
  S.finished = false;
  S.paused = false;
  S.modalOpen = false;
  S.stages = m.endless ? [] : m.stages.slice();
  ensureStages(4);
  S.stage = 0;
  S.done = [];
  S.cleared = 0;
  S.picks = m.picks;
  S.scanners = m.scanners;
  S.scan = null;
  S.wear = 0;
  S.angle = 0;
  S.rot = 0;
  S.turning = false;
  S.jammed = false;
  S.advancing = false;
  S.flash = 0;
  S.term = null;
  S.termLockLeft = 0;
  S.cooldownLeft = 0;
  S.elapsed = 0;
  S.timeLeft = m.timeLimit || 0;
  S.stats = { broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 };
  S.journal = [];
  enterStage(true);
  updatePicks(false);
  updateWear();
  updateTimer();
  renderLog();
  canvas.classList.remove('success-glow');
  updateButtons();
}

function showStartScreen() {
  S.started = false;
  S.finished = false;
  const saved = loadRun();
  continueBtn.hidden = !saved;
  if (saved) {
    const d = DIFFS[saved.diff];
    const stg = d.endless ? `ЭТАП ${saved.stage + 1}` : `ЭТАП ${saved.stage + 1}/${(saved.stages || d.stages).length}`;
    continueBtn.innerHTML = `&gt; ПРОДОЛЖИТЬ: ${d.name}, ${stg}`;
    startBtn.classList.add('secondary');
    applyRun(saved);
  } else {
    startBtn.classList.remove('secondary');
    resetGame();
  }
  showBest();
  pauseOverlay.classList.remove('visible');
  startOverlay.classList.add('visible');
  switchTab('hack', true);
}

function beginPlaying() {
  AudioEngine.init();
  Sound.click();
  startOverlay.classList.remove('visible');
  S.started = true;
  S.paused = false;
  lastT = performance.now();
  switchTab('hack');
  updateButtons();
  if (isLock()) resizeCanvas();
}

function startNew() {
  clearRun();
  resetGame();
  P.runs++;
  saveProfile();
  Tutorial.start();
  beginPlaying();
  const m = cfg();
  log(`Режим «${m.name}». Отмычек: ${S.picks}, сканеров: ${S.scanners}.`);
  if (m.timeLimit) log(`Охрана прибудет через ${fmtTime(m.timeLimit)}.`, 'bad');
  log(`${stageLabel(0)}: допуск ±${tol()}°.`);
  tutorialForStage();
  saveRun();
}

function continueRun() {
  const r = loadRun();
  Tutorial.active = !!(r && r.tutorial);
  Tutorial.seen = (r && r.tutorial) || {};
  beginPlaying();
  log('Сеанс восстановлен.');
}

function bestText(id) {
  const b = P.best[id];
  if (!b) return null;
  if (DIFFS[id].endless) return `${b.stages} ЭТ.`;
  return fmtTime(b.time);
}

function showBest() {
  const b = P.best[chosenDiff];
  const name = DIFFS[chosenDiff].name;
  if (!b) bestLine.textContent = '';
  else if (DIFFS[chosenDiff].endless) bestLine.textContent = `РЕКОРД (${name}): ${b.stages} этапов за ${fmtTime(b.time)}`;
  else bestLine.textContent = `РЕКОРД (${name}): ${fmtTime(b.time)} · сломано отмычек: ${b.broken}`;
  $('modeDesc').textContent = DIFFS[chosenDiff].desc;
}

function rankFor(broken, wrong, lockouts) {
  const score = broken + wrong * 0.5 + lockouts;
  if (score === 0) return 'ПРИЗРАК';
  if (score <= 1) return 'ПРОФЕССИОНАЛ';
  if (score <= 3) return 'ВЗЛОМЩИК';
  return 'ГРУБАЯ СИЛА';
}

function endlessRank(n) {
  if (n >= 20) return 'ЛЕГЕНДА ПУСТОШИ';
  if (n >= 12) return 'ПРИЗРАК';
  if (n >= 6) return 'ПРОФЕССИОНАЛ';
  if (n >= 3) return 'ВЗЛОМЩИК';
  return 'НОВИЧОК';
}

function endGame(win, reason) {
  if (S.finished) return;
  S.finished = true;
  S.paused = false;
  turnStop();
  clearRun();
  Tutorial.finish();
  updateButtons();

  const m = cfg();
  const time = S.elapsed;
  let isRecord = false;
  let rank;
  let title;
  let lines;
  let statsHtml;

  if (m.endless) {
    const prev = P.best[S.diff];
    isRecord = !prev || S.cleared > prev.stages || (S.cleared === prev.stages && time < prev.time);
    if (isRecord && S.cleared > 0) P.best[S.diff] = { stages: S.cleared, time, broken: S.stats.broken };
    else isRecord = false;
    rank = endlessRank(S.cleared);
    title = 'СЕАНС ОКОНЧЕН';
    lines = ['ОТМЫЧКИ ЗАКОНЧИЛИСЬ.', `ПРОЙДЕНО ЭТАПОВ: ${S.cleared}`, `РАНГ: ${rank}`];
    statsHtml = `
      <div class="stat"><span>ЭТАПОВ</span><b>${S.cleared}${isRecord ? ' ★' : ''}</b></div>
      <div class="stat"><span>ВРЕМЯ</span><b>${fmtTime(time)}</b></div>
      <div class="stat"><span>СЛОМАНО</span><b>${S.stats.broken}</b></div>`;
    Sound.lockout();
  } else if (!win) {
    rank = 'ПРОВАЛ';
    title = 'ДОСТУП ЗАПРЕЩЁН';
    lines = ['ОХРАНА ПРИБЫЛА.', `РЕЖИМ: ${m.name}`, `ВЗЛОМАНО ЭТАПОВ: ${S.cleared}/${S.stages.length}`];
    statsHtml = `
      <div class="stat"><span>ЭТАПОВ</span><b>${S.cleared}/${S.stages.length}</b></div>
      <div class="stat"><span>СЛОМАНО</span><b>${S.stats.broken}</b></div>
      <div class="stat"><span>БЛОКИРОВКИ</span><b>${S.stats.lockouts}</b></div>`;
    Sound.lockout();
    vibrate([200, 100, 200]);
  } else {
    const prev = P.best[S.diff];
    isRecord = !prev || time < prev.time;
    if (isRecord) P.best[S.diff] = { time, broken: S.stats.broken };
    rank = rankFor(S.stats.broken, S.stats.wrong, S.stats.lockouts);
    title = 'ДОСТУП РАЗРЕШЁН';
    lines = ['ВСЕ СИСТЕМЫ ВЗЛОМАНЫ.', `РЕЖИМ: ${m.name}`, `РАНГ: ${rank}`];
    if (m.timeLimit) lines.splice(1, 0, `ДО ПРИБЫТИЯ ОХРАНЫ: ${fmtTime(S.timeLeft)}`);
    statsHtml = `
      <div class="stat"><span>ВРЕМЯ</span><b>${fmtTime(time)}${isRecord ? ' ★' : ''}</b></div>
      <div class="stat"><span>СЛОМАНО</span><b>${S.stats.broken}</b></div>
      <div class="stat"><span>БЛОКИРОВКИ</span><b>${S.stats.lockouts}</b></div>`;
    Sound.win();
  }

  const counts = win || m.endless;
  if (counts) P.finished++;
  P.history.unshift({ d: Date.now(), diff: S.diff, time, broken: S.stats.broken, rank, stages: S.cleared, lost: !win && !m.endless });
  P.history = P.history.slice(0, 20);
  saveProfile();

  const gained = (win ? [
    'first',
    S.stats.broken === 0 && 'ghost',
    S.diff === 'hard' && 'master',
    S.diff === 'alarm' && 'alarm',
    (S.diff === 'normal' || S.diff === 'hard') && time < 120000 && 'speed',
  ] : []).concat([counts && P.finished >= 10 && 'veteran'])
    .filter((id) => id && unlock(id)).map((id) => ACHIEVEMENTS.find((a) => a.id === id));

  const lost = !win && !m.endless;
  $('winBox').classList.toggle('lost', lost);
  $('endTitle').textContent = title;
  $('endMsg').innerHTML = '';
  lines.forEach((t, i) => {
    const p = document.createElement('p');
    p.className = 'line-reveal';
    p.style.animationDelay = (0.3 + i * 0.6) + 's';
    p.textContent = t;
    $('endMsg').appendChild(p);
  });
  $('stats').innerHTML = statsHtml;
  $('newAch').innerHTML = gained.map((a) => `<div>★ ${a.name} — ${a.desc}</div>`).join('');
  log(`${title}. ${m.endless ? `Этапов: ${S.cleared}.` : `Время: ${fmtTime(time)}.`}${isRecord ? ' Новый рекорд!' : ''}`, lost ? 'bad' : 'good');

  winOverlay.classList.add('visible');
  startRain(lost);
}

startBtn.addEventListener('click', startNew);
continueBtn.addEventListener('click', continueRun);
restartBtn.addEventListener('click', () => {
  Sound.click();
  winOverlay.classList.remove('visible');
  stopRain();
  showStartScreen();
});
$('statsLinkBtn').addEventListener('click', () => {
  AudioEngine.init();
  Sound.click();
  startOverlay.classList.remove('visible');
  switchTab('stat');
});

function selectDiff(d) {
  chosenDiff = d;
  localStorage.setItem('oz.diff', d);
  document.querySelectorAll('.diff-btn').forEach((x) => {
    const on = x.dataset.diff === d;
    x.classList.toggle('active', on);
    x.setAttribute('aria-checked', on);
  });
}

document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    AudioEngine.init();
    Sound.key();
    selectDiff(b.dataset.diff);
    if (continueBtn.hidden) resetGame();
    showBest();
  });
});

function buildTopics() {
  const box = $('topics');
  box.innerHTML = '';
  Object.entries(QUESTION_TOPICS).forEach(([id, name]) => {
    const b = document.createElement('button');
    b.className = 'chip topic-btn' + (S.topics.includes(id) ? ' active' : '');
    b.textContent = name;
    b.setAttribute('aria-pressed', S.topics.includes(id));
    b.addEventListener('click', () => {
      AudioEngine.init();
      Sound.key();
      if (S.topics.includes(id)) {
        if (S.topics.length === 1) { toast('Нужна хотя бы одна тема'); return; }
        S.topics = S.topics.filter((t) => t !== id);
      } else {
        S.topics.push(id);
      }
      localStorage.setItem('oz.topics', JSON.stringify(S.topics));
      buildTopics();
    });
    box.appendChild(b);
  });
}

function toggleSound() {
  AudioEngine.init();
  AudioEngine.setEnabled(!AudioEngine.enabled);
  updateSoundBtn();
  if (AudioEngine.enabled) Sound.click();
}
soundBtn.addEventListener('click', toggleSound);

// ═══════════════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════════════
function applySettings() {
  const html = document.documentElement;
  if (SETTINGS.theme && SETTINGS.theme !== 'green') html.dataset.theme = SETTINGS.theme;
  else delete html.dataset.theme;
  html.classList.toggle('large', !!SETTINGS.large);
  html.classList.toggle('no-crt', !SETTINGS.crt);
  AudioEngine.setVolume(SETTINGS.volume / 100);
  Terminal.setTyping(!!SETTINGS.typing);
  readTheme();
  if (isLock()) resizeCanvas();
}

function syncSettingsUI() {
  $('setVolume').value = SETTINGS.volume;
  $('setVolumeVal').textContent = SETTINGS.volume + '%';
  $('setVibro').checked = SETTINGS.vibro;
  $('setCrt').checked = SETTINGS.crt;
  $('setTyping').checked = SETTINGS.typing;
  $('setLarge').checked = SETTINGS.large;
  document.querySelectorAll('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === SETTINGS.theme));
}

$('setVolume').addEventListener('input', (e) => {
  SETTINGS.volume = +e.target.value;
  $('setVolumeVal').textContent = SETTINGS.volume + '%';
  AudioEngine.init();
  AudioEngine.setVolume(SETTINGS.volume / 100);
  saveSettings();
});
$('setVolume').addEventListener('change', () => Sound.click());
[['setVibro', 'vibro'], ['setCrt', 'crt'], ['setTyping', 'typing'], ['setLarge', 'large']].forEach(([id, key]) => {
  $(id).addEventListener('change', (e) => {
    SETTINGS[key] = e.target.checked;
    saveSettings();
    applySettings();
    AudioEngine.init();
    Sound.key();
    if (key === 'vibro' && SETTINGS.vibro) vibrate(40);
  });
});
document.querySelectorAll('.theme-btn').forEach((b) => b.addEventListener('click', () => {
  SETTINGS.theme = b.dataset.theme;
  saveSettings();
  applySettings();
  syncSettingsUI();
  AudioEngine.init();
  Sound.key();
}));
$('tutorialResetBtn').addEventListener('click', () => {
  localStorage.removeItem(TUTORIAL_KEY);
  Sound.click();
  toast('Обучение включено для следующего взлома');
});

// ═══════════════════════════════════════════════
// ВКЛАДКИ: СТАТ / ИНВ / ДАННЫЕ / НАСТР
// ═══════════════════════════════════════════════
function switchTab(tab, silent) {
  if (tab !== 'hack') { turnStop(); Tutorial.hide(); }
  S.tab = tab;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
  if (tab === 'stat') renderStat();
  if (tab === 'inv') renderInv();
  if (tab === 'data') renderData();
  if (tab === 'cfg') syncSettingsUI();
  if (tab === 'hack' && !silent) {
    lastT = performance.now();
    if (!S.started && !S.finished) showStartScreen();
    else if (isLock()) resizeCanvas();
  }
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  AudioEngine.init();
  Sound.key();
  switchTab(t.dataset.tab);
}));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bar(pct, cls = '') {
  const n = 10;
  const on = Math.round(pct / 100 * n);
  return `<span class="tbar ${cls}">${'█'.repeat(on)}${'░'.repeat(n - on)}</span>`;
}

function renderStat() {
  const answers = P.right + P.wrong;
  const rows = [
    ['ВЗЛОМОВ НАЧАТО', P.runs],
    ['ВЗЛОМОВ ЗАВЕРШЕНО', P.finished],
    ['ЗАМКОВ ВСКРЫТО', P.locks],
    ['ТЕРМИНАЛОВ ВЗЛОМАНО', P.terms],
    ['ОТМЫЧЕК СЛОМАНО', P.broken],
    ['СКАНЕРОВ ИСПОЛЬЗОВАНО', P.scans],
    ['БЛОКИРОВОК ТЕРМИНАЛА', P.lockouts],
    ['ВЕРНЫХ ОТВЕТОВ', answers ? `${P.right}/${answers} (${Math.round(P.right / answers * 100)}%)` : '—'],
    ['ВРЕМЯ ВО ВЗЛОМЕ', fmtLong(P.playMs)],
  ];
  const best = Object.entries(DIFFS).map(([id, d]) =>
    `<div class="rec"><span>${d.name}</span><b>${bestText(id) || '--:--'}</b></div>`).join('');
  const got = ACHIEVEMENTS.filter((a) => P.ach[a.id]).length;
  $('statPane').innerHTML = `
    <h3>РЕКОРДЫ</h3>
    <div class="records">${best}</div>
    <h3>ПОКАЗАТЕЛИ</h3>
    <div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <h3>ДОСТИЖЕНИЯ ${got}/${ACHIEVEMENTS.length}</h3>
    <div class="ach">${ACHIEVEMENTS.map((a) => `
      <div class="ach-item ${P.ach[a.id] ? 'got' : ''}">
        <span class="ach-icon">${P.ach[a.id] ? '★' : '☆'}</span>
        <span><b>${a.name}</b><br><small>${a.desc}</small></span>
      </div>`).join('')}
    </div>`;
}

function renderInv() {
  const inRun = S.started || loadRun();
  let picks = '';
  if (!inRun) {
    picks = '<div class="muted">Нет активного взлома.</div>';
  } else if (S.picks <= 0) {
    picks = '<div class="muted">ПУСТО — запроси резерв.</div>';
  } else {
    for (let i = 0; i < S.picks; i++) {
      const hp = i === 0 ? Math.round(100 - S.wear) : 100;
      picks += `<div class="inv-item"><span>ОТМЫЧКА #${i + 1}${i === 0 ? ' (В ЗАМКЕ)' : ''}</span>${bar(hp, hp < 35 ? 'low' : '')}<b>${hp}%</b></div>`;
    }
  }
  const scanners = inRun
    ? (S.scanners > 0
      ? Array.from({ length: S.scanners }, (_, i) => `<div class="inv-item"><span>⌖ СКАНЕР #${i + 1}</span><b>ГОТОВ</b></div>`).join('')
      : '<div class="muted">Нет сканеров.</div>')
    : '<div class="muted">—</div>';
  let from = 0;
  let to = S.stages.length - 1;
  if (cfg().endless) { from = Math.max(0, S.stage - 4); to = S.stage + 1; ensureStages(to); }
  let keys = '';
  for (let i = from; i <= to; i++) {
    keys += `<div class="inv-item ${S.done[i] || i === S.stage ? '' : 'dim'}"><span>${S.done[i] ? '✓' : '·'} ${stageLabel(i)}</span><b>${S.done[i] ? 'ВЗЛОМАН' : i === S.stage ? 'ТЕКУЩИЙ' : 'ЗАКРЫТ'}</b></div>`;
  }
  $('invPane').innerHTML = `
    <h3>ОТМЫЧКИ</h3>
    <div class="inv-list">${picks}</div>
    <h3>СКАНЕРЫ</h3>
    <div class="inv-list">${scanners}</div>
    <h3>КЛЮЧИ ДОСТУПА · ${cfg().name}</h3>
    <div class="inv-list">${inRun ? keys : '<div class="muted">—</div>'}</div>
    <h3>ТЕКУЩИЙ ВЗЛОМ</h3>
    <div class="kv">
      <div><span>ВРЕМЯ</span><b>${fmtTime(S.elapsed)}</b></div>
      ${cfg().timeLimit ? `<div><span>ДО ПРИБЫТИЯ ОХРАНЫ</span><b>${fmtTime(S.timeLeft)}</b></div>` : ''}
      <div><span>ЭТАПОВ ПРОЙДЕНО</span><b>${S.cleared}</b></div>
      <div><span>СЛОМАНО ОТМЫЧЕК</span><b>${S.stats.broken}</b></div>
      <div><span>ОТВЕТЫ</span><b>${S.stats.right}/${S.stats.right + S.stats.wrong}</b></div>
      <div><span>БЛОКИРОВКИ ТЕРМИНАЛА</span><b>${S.stats.lockouts}</b></div>
    </div>`;
}

let resetArmed = false;
function renderData() {
  const hist = P.history.length
    ? P.history.map((h) => {
        const d = new Date(h.d);
        const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const mode = DIFFS[h.diff] ? DIFFS[h.diff].name : h.diff;
        const res = h.diff === 'endless' ? `${h.stages} ЭТ.` : h.lost ? 'ПРОВАЛ' : fmtTime(h.time);
        return `<div class="hist ${h.lost ? 'lost' : ''}"><span>${date}</span><span>${mode}</span><b>${res}</b><span>✕${h.broken}</span><span class="hist-rank">${esc(h.rank)}</span></div>`;
      }).join('')
    : '<div class="muted">Пока пусто.</div>';
  const journal = S.journal.length
    ? S.journal.slice().reverse().map((l) => `<div class="${l.k}"><span class="jt">${l.t}</span> ${esc(l.m)}</div>`).join('')
    : '<div class="muted">Пока пусто.</div>';
  $('dataPane').innerHTML = `
    <h3>ЖУРНАЛ ТЕКУЩЕГО ВЗЛОМА</h3>
    <div class="journal">${journal}</div>
    <h3>ИСТОРИЯ ВЗЛОМОВ</h3>
    <div class="history">${hist}</div>
    <button class="link-btn danger" id="resetStatsBtn">${resetArmed ? '[ ТОЧНО? НАЖМИ ЕЩЁ РАЗ ]' : '[ СБРОСИТЬ СТАТИСТИКУ ]'}</button>`;
  $('resetStatsBtn').addEventListener('click', () => {
    if (!resetArmed) { resetArmed = true; renderData(); setTimeout(() => { resetArmed = false; if (S.tab === 'data') renderData(); }, 3000); return; }
    resetArmed = false;
    Object.assign(P, emptyProfile());
    saveProfile();
    toast('Статистика сброшена');
    renderData();
  });
}

// ═══════════════════════════════════════════════
// ЭФФЕКТЫ: загрузочный лог и цифровой дождь
// ═══════════════════════════════════════════════
const BOOT_LINES = [
  'ROBUST-OS BIOS v4.1 ............ OK',
  'ПАМЯТЬ: 64K ..................... OK',
  'ДАТЧИК ДАВЛЕНИЯ ЦИЛИНДРА ........ OK',
  'ЗАМКИ И ТЕРМИНАЛЫ ............... ЗАБЛОКИРОВАНЫ',
  'ЗАГРУЗКА УТИЛИТЫ ВЗЛОМА ......... ГОТОВО',
];

function runBoot() {
  bootLog.innerHTML = '';
  let i = 0;
  const next = () => {
    if (i >= BOOT_LINES.length) return;
    const line = document.createElement('div');
    line.textContent = BOOT_LINES[i++];
    bootLog.appendChild(line);
    setTimeout(next, 180);
  };
  next();
}

const rainCanvas = $('rainCanvas');
const rctx = rainCanvas.getContext('2d');
let rainRAF = null;
function startRain(red) {
  const chars = '01ΔΣΩ#$%&@ЖЮЯ7<>/\\=+*';
  const fs = 16;
  rainCanvas.width = window.innerWidth;
  rainCanvas.height = window.innerHeight;
  const cols = Math.ceil(rainCanvas.width / fs);
  const drops = Array.from({ length: cols }, () => Math.random() * -50);
  const col = red ? 'rgba(255,59,59,0.5)' : pri(1, 0.55);
  const hot = red ? '#ffd0d0' : priLight(1);
  let last = 0;
  const step = (t) => {
    rainRAF = requestAnimationFrame(step);
    if (t - last < 50) return;
    last = t;
    rctx.fillStyle = 'rgba(0,0,0,0.12)';
    rctx.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
    rctx.font = fs + 'px VT323, monospace';
    drops.forEach((y, i) => {
      rctx.fillStyle = Math.random() < 0.05 ? hot : col;
      rctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, y * fs);
      drops[i] = y * fs > rainCanvas.height && Math.random() > 0.97 ? 0 : y + 1;
    });
  };
  rainRAF = requestAnimationFrame(step);
}
function stopRain() {
  if (rainRAF) cancelAnimationFrame(rainRAF);
  rainRAF = null;
  rctx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
}

// ═══════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════
window.addEventListener('resize', () => { if (isLock()) resizeCanvas(); Tutorial.position(); });
applySettings();
selectDiff(S.diff);
buildTopics();
updateSoundBtn();
showStartScreen();
runBoot();
requestAnimationFrame(loop);
