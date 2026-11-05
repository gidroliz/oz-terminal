'use strict';

// ═══════════════════════════════════════════════
// РЕЖИМЫ И ЭТАПЫ
// ═══════════════════════════════════════════════
// Замки: normal — обычный, rusty — износ ×2, double — два штифта подряд, float — точка плавает
// Терминалы: normal, hint — подсказка одной буквы, shuffle — дамп перемешивается после ошибки,
// trap — часть скобок оказывается ловушкой
const L = (tol, kind = 'normal') => ({ type: 'lock', tol, kind });
const T = (len, count, kind = 'normal') => ({ type: 'term', len, count, kind });

const NORMAL_STAGES = [L(10), T(6, 12, 'hint'), L(6.5, 'rusty'), T(7, 14, 'shuffle'), L(5, 'double')];

const DIFFS = {
  easy:    { picks: 3, scanners: 2, wearRate: 55, stages: [L(14), T(5, 10), L(9)] },
  normal:  { picks: 2, scanners: 1, wearRate: 75, stages: NORMAL_STAGES },
  hard:    { picks: 1, scanners: 0, wearRate: 100, stages: [L(7, 'rusty'), T(7, 14, 'trap'), L(5, 'float'), T(8, 16, 'shuffle'), L(3, 'double')] },
  alarm:   { picks: 2, scanners: 1, wearRate: 75, stages: NORMAL_STAGES, timeLimit: 150000, timeBonus: 15000 },
  endless: { picks: 2, scanners: 1, wearRate: 75, endless: true },
};
const modeName = (id) => t('mode.' + id);

const LOCK_KINDS = ['normal', 'rusty', 'double', 'float'];
const TERM_KINDS = ['normal', 'hint', 'shuffle', 'trap'];

function endlessStage(n) {
  const k = Math.floor(n / 2);
  const pick = (arr) => (n < 4 ? 'normal' : arr[Math.floor(Math.random() * arr.length)]);
  if (n % 2 === 0) return L(Math.max(1.8, Math.round((12 - k * 1.4) * 10) / 10), pick(LOCK_KINDS));
  return T(Math.min(8, 5 + Math.floor(k / 2)), Math.min(16, 10 + k), pick(TERM_KINDS));
}

const CFG = {
  ROT_SPEED: 70,
  RETURN_SPEED: 260,
  OPEN_ANGLE: 90,
  FALLOFF: 38,
  PICK_LIMIT: 88,
  DRAG_SENS: 0.55,
  REQ_COOLDOWN_BAD: 6,
  REQ_COOLDOWN_GOOD: 20,
  TERM_LOCKOUT: 10,
  ENDLESS_LOCKOUT: 3,
  ENDLESS_PICK_EVERY: 3,
  ENDLESS_MAX_PICKS: 5,
  UPGRADE_EVERY: 5,
  FLOAT_AMP: 10,
  FLOAT_SPEED: 0.7,
  STAR_LOCK_SEC: 25,
  STAR_TERM_SEC: 50,
  STAR_WEAR: 35,
};

// Апгрейды бесконечного режима
const UPGRADES = ['durable', 'attempts', 'sharpscan', 'touch', 'picks', 'scans', 'brackets'];

const ACHIEVEMENTS = [
  { id: 'first' }, { id: 'ghost' }, { id: 'hacker' }, { id: 'master' }, { id: 'speed' },
  { id: 'alarm' }, { id: 'endless10' }, { id: 'endless25' }, { id: 'perfect' }, { id: 'rust' },
  { id: 'erudite' }, { id: 'brute' }, { id: 'veteran' }, { id: 'archivist' }, { id: 'polyglot' },
  { id: 'oneshot', hidden: true }, { id: 'cleaner', hidden: true }, { id: 'sapper', hidden: true },
  { id: 'analyst', hidden: true }, { id: 'night', hidden: true },
];

// ═══════════════════════════════════════════════
// ХРАНИЛИЩЕ
// ═══════════════════════════════════════════════
const PROFILE_KEY = 'oz.profile';
const RUN_KEY = 'oz.run';
const SETTINGS_KEY = 'oz.settings';
const TUTORIAL_KEY = 'oz.tutorial';

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}

function emptyProfile() {
  return { runs: 0, finished: 0, locks: 0, terms: 0, broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0, stars: 0, lore: 0, playMs: 0, best: {}, history: [], ach: {} };
}

const P = Object.assign(emptyProfile(), loadJSON(PROFILE_KEY, {}));
['easy', 'normal', 'hard'].forEach((d) => {
  const old = loadJSON('oz.best.' + d, null);
  if (old && !P.best[d]) P.best[d] = old;
  localStorage.removeItem('oz.best.' + d);
});
function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(P)); }

const SETTINGS = Object.assign(
  { volume: 80, vibro: true, crt: true, typing: true, large: false, theme: 'green', lang: LANG },
  loadJSON(SETTINGS_KEY, {}),
);
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }

function unlock(id) {
  if (P.ach[id]) return false;
  P.ach[id] = Date.now();
  saveProfile();
  const name = t(`ach.${id}.name`);
  toast(t('toast.ach', { name }));
  log(t('log.ach', { name }), 'good');
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
  stars: [],
  cleared: 0,
  picks: 0,
  scanners: 0,
  scan: null,
  ups: {},
  pendingUpgrade: false,
  wear: 0,
  angle: 0,
  target: 0,
  targetBase: 0,
  floatPhase: 0,
  pinsLeft: 1,
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
  st: { t0: 0, broken: 0, wear: 0, jams: 0, lockouts: 0 }, // показатели текущего этапа
  stats: { broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 },
  journal: [],
};
if (!DIFFS[S.diff]) S.diff = 'normal';
let chosenDiff = S.diff;

const cfg = () => DIFFS[S.diff];
const stageCfg = () => S.stages[S.stage];
const isLock = () => { const st = stageCfg(); return !st || st.type === 'lock'; };
const lockKind = () => (stageCfg() && stageCfg().kind) || 'normal';
const tol = () => stageCfg().tol + (S.ups.touch || 0) * 1.5;
const wearRate = () => cfg().wearRate * (lockKind() === 'rusty' ? 2 : 1) * Math.pow(0.75, S.ups.durable || 0);

function ensureStages(upto) {
  if (!cfg().endless) return;
  while (S.stages.length <= upto) S.stages.push(endlessStage(S.stages.length));
}

function stageLabel(i) {
  const st = S.stages;
  const n = st.slice(0, i + 1).filter((s) => s.type === st[i].type).length;
  return t(st[i].type === 'lock' ? 'stage.lock' : 'stage.term', { n });
}

function protectionName(v) {
  if (v >= 10) return t('prot.low');
  if (v >= 6) return t('prot.mid');
  if (v >= 3.5) return t('prot.high');
  return t('prot.max');
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
const kindTag = $('kindTag');
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
const upOverlay = $('upgradeOverlay');
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
const starStr = (arr) => (arr || []).map((x) => (x ? '★' : '☆')).join('');

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
    if (S.done[i]) {
      b.classList.add('completed');
      const s = document.createElement('i');
      s.className = 'badge-stars';
      s.textContent = starStr(S.stars[i]);
      b.appendChild(s);
    } else if (i === S.stage) b.classList.add('active');
    else b.classList.add('locked');
    levelIndicator.appendChild(b);
  }
  const st = stageCfg();
  const prefix = cfg().endless ? t('title.stagePrefix', { n: S.stage + 1 }) : '';
  lvlTitle.textContent = st.type === 'lock'
    ? `[ ${prefix}${stageLabel(S.stage)}: ${protectionName(st.tol)} ]`
    : `[ ${prefix}${t('title.term', { n: stageLabel(S.stage).split(' ')[1], len: st.len })} ]`;
  updateKindTag();
}

function updateKindTag() {
  const st = stageCfg();
  // У терминала тип показывается в его собственном заголовке
  if (!st || st.type !== 'lock' || st.kind === 'normal' || !st.kind) { kindTag.hidden = true; return; }
  kindTag.hidden = false;
  let txt = t(`kind.${st.type}.${st.kind}`);
  if (st.type === 'lock' && st.kind === 'double') txt += ` ${3 - S.pinsLeft}/2`;
  kindTag.textContent = txt;
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
  getPinBtn.textContent = cd > 0 ? t('btn.cooldown', { n: cd }) : t('btn.reserve');
  getPinBtn.classList.toggle('attention', !getPinBtn.disabled && S.picks <= 0 && isLock() && !cfg().endless);
  scanBtn.disabled = !canScanNow();
  canvas.classList.toggle('disabled-canvas', b || S.picks <= 0);
  Terminal.setEnabled(!b && S.termLockLeft <= 0);
  pauseBtn.disabled = !S.started || S.finished;

  if (S.started && !S.finished && S.picks <= 0 && !S.modalOpen) {
    hintText.textContent = t(cfg().endless ? 'hint.noPicksEndless' : 'hint.noPicks');
  } else if (!S.turning) {
    hintText.textContent = t('hint.drag');
  }
}

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function fmtLong(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? t('time.hm', { h, m: m % 60 }) : t('time.ms', { m, s: Math.floor(ms / 1000) % 60 });
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
  soundBtn.textContent = t(AudioEngine.enabled ? 'btn.soundOn' : 'btn.soundOff');
  soundBtn.classList.toggle('off', !AudioEngine.enabled);
}

function setHackIdle() { hackTxt.textContent = t('btn.turn'); }

// ═══════════════════════════════════════════════
// ОБУЧЕНИЕ
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
$('coachSkip').addEventListener('click', () => { Sound.click(); Tutorial.finish(); toast(t('toast.tutorialSkipped')); });
document.addEventListener('pointerdown', (e) => {
  if (!coachEl.hidden && !$('coachOk').hidden && !coachEl.contains(e.target)) Tutorial.hide();
}, true);

function tutorialForStage() {
  if (!Tutorial.active) return;
  if (isLock() && !Tutorial.seen.drag) {
    Tutorial.dragFrom = S.angle;
    Tutorial.show('drag', canvas, t('tut.drag'));
  } else if (!isLock() && !Tutorial.seen.term1) {
    Tutorial.show('term1', termView, t('tut.term1'));
  }
}

// ═══════════════════════════════════════════════
// ЭТАПЫ
// ═══════════════════════════════════════════════
function newTarget() {
  let v;
  const margin = lockKind() === 'float' ? CFG.FLOAT_AMP : 0;
  do { v = (Math.random() * 2 - 1) * (80 - margin); } while (Math.abs(v) < tol() * 1.5);
  S.targetBase = v;
  S.target = v;
  S.floatPhase = Math.random() * Math.PI * 2;
}

function resetStageStats() {
  S.st = { t0: S.elapsed, broken: 0, wear: 0, jams: 0, lockouts: 0 };
}

function enterStage(fresh) {
  S.rot = 0;
  S.turning = false;
  S.jammed = false;
  if (fresh) resetStageStats();
  if (isLock()) {
    if (fresh) {
      S.angle = 0;
      S.scan = null;
      S.pinsLeft = lockKind() === 'double' ? 2 : 1;
      newTarget();
    }
    S.term = null;
  } else if (fresh || !S.term) {
    S.term = createTerm();
    S.termLockLeft = 0;
    S.scan = null;
  }
  renderStage();
}

function createTerm() {
  const st = stageCfg();
  return Terminal.create({
    len: st.len,
    count: st.count,
    kind: st.kind || 'normal',
    lang: LANG,
    attempts: 4 + (S.ups.attempts || 0),
    extraBrackets: (S.ups.brackets || 0) * 3,
    safeBrackets: !!S.ups.brackets,
  });
}

function renderStage() {
  const lock = isLock();
  lockView.hidden = !lock;
  termView.hidden = lock;
  actionPanel.classList.toggle('hidden', !lock);
  setHackIdle();
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

// Звёзды этапа: скорость, без поломок/блокировок, чистая работа
function calcStars() {
  const sec = (S.elapsed - S.st.t0) / 1000;
  if (isLock()) {
    const limit = CFG.STAR_LOCK_SEC * (lockKind() === 'double' ? 1.6 : 1);
    return [sec <= limit, S.st.broken === 0, S.st.wear < CFG.STAR_WEAR];
  }
  return [sec <= CFG.STAR_TERM_SEC, S.st.lockouts === 0, (S.term ? S.term.wrong : 9) <= 1];
}

function completeStage(msgKey, params) {
  S.advancing = true;
  const stars = calcStars();
  S.stars[S.stage] = stars;
  const got = stars.filter(Boolean).length;
  P.stars += got;
  S.done[S.stage] = true;
  S.cleared++;
  updateBadges();
  log(`${t(msgKey, params)} ${starStr(stars)}`, 'good');

  const h = new Date().getHours();
  if (h >= 0 && h < 5) unlock('night');

  // Журнал комплекса
  if (P.lore < LORE.length) {
    P.lore++;
    const entry = LORE[P.lore - 1][LANG] || LORE[P.lore - 1].ru;
    log(t('log.lore', { n: P.lore, title: entry[0] }), 'good');
    toast(t('toast.lore', { n: P.lore }));
    if (P.lore >= LORE.length) unlock('archivist');
  }

  if (cfg().timeLimit) {
    S.timeLeft += cfg().timeBonus;
    toast(t('toast.timeBonus', { n: cfg().timeBonus / 1000 }));
  }
  if (cfg().endless) {
    if (S.cleared % CFG.ENDLESS_PICK_EVERY === 0 && S.picks < CFG.ENDLESS_MAX_PICKS) {
      S.picks++;
      if (S.picks === 1) S.wear = 0;
      updatePicks(true);
      updateWear();
      log(t('log.pickFound'), 'good');
    }
    if (S.cleared >= 10) unlock('endless10');
    if (S.cleared >= 25) unlock('endless25');
    if (S.cleared % CFG.UPGRADE_EVERY === 0) S.pendingUpgrade = true;
  }
  saveProfile();
  updateButtons();
  saveRun();
  setTimeout(nextStage, 1300);
}

function nextStage() {
  canvas.classList.remove('success-glow');
  if (S.finished) return;
  if (S.pendingUpgrade) { openUpgrade(); return; }
  S.advancing = false;
  ensureStages(S.stage + 1);
  if (S.stage + 1 < S.stages.length) {
    S.stage++;
    enterStage(true);
    log(isLock() ? t('log.lockStage', { name: stageLabel(S.stage), tol: tol() }) : t('log.termStage', { len: stageCfg().len }));
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
  hintText.textContent = t('hint.hold');
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
    Tutorial.show('search', S.scanners > 0 ? scanBtn : lockArea, t('tut.search') + (S.scanners > 0 ? ' ' + t('tut.scanner') : ''), true);
  }
  updateButtons();
  saveRun();
}

function breakPick() {
  S.picks--;
  S.wear = 0;
  S.stats.broken++;
  S.st.broken++;
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
  hackTxt.textContent = t('btn.pickBroken');
  setTimeout(() => { if (!S.turning && !S.advancing) setHackIdle(); }, 1100);
  if (P.broken >= 10) unlock('brute');
  saveProfile();
  if (cfg().endless && S.picks <= 0) {
    log(t('log.lastPickEndless'), 'bad');
    S.advancing = true;
    updateButtons();
    setTimeout(() => endGame(false, 'picks'), 900);
    return;
  }
  log(S.picks > 0 ? t('log.pickBroken', { n: S.picks }) : t('log.lastPick'), 'bad');
  updateButtons();
  saveRun();
}

function unlockLock() {
  // Двойной замок: первый штифт сдаётся, нужна новая точка
  if (S.pinsLeft > 1) {
    S.pinsLeft--;
    turnStop();
    S.rot = CFG.OPEN_ANGLE;
    S.scan = null;
    newTarget();
    Sound.unlock();
    vibrate(30);
    log(t('log.pinDone'), 'good');
    updateKindTag();
    updateButtons();
    saveRun();
    return;
  }
  S.flash = 1;
  turnStop();
  setLamp('active-green');
  Sound.unlock();
  vibrate(40);
  hackTxt.textContent = t('btn.lockOpen');
  canvas.classList.add('success-glow');
  P.locks++;
  if (S.st.jams === 0) unlock('oneshot');
  if (lockKind() === 'rusty' && S.st.broken === 0) unlock('rust');
  Tutorial.hide();
  completeStage('log.lockOpened', { name: stageLabel(S.stage) });
}

// ─── Терминал ────────────────────────────────
function termChanged(term) {
  if (term.wrong > 0 && Tutorial.step === 'term1') {
    Tutorial.done('term1');
    Tutorial.show('term2', termView, t('tut.term2'), true);
  }
  updateButtons();
  saveRun();
}

function termSolved(term) {
  Sound.granted();
  vibrate(40);
  P.terms++;
  if (term.wrong === 0) unlock('hacker');
  if (term.words.filter((w) => !w.removed).length === 1) unlock('cleaner');
  if (term.kind === 'trap' && !term.trapsHit && term.bracketsUsed > 0) unlock('sapper');
  if ((term.marked || []).length >= 3) unlock('analyst');
  saveProfile();
  Tutorial.finish();
  completeStage('log.termHacked');
}

function termLockout() {
  S.stats.lockouts++;
  S.st.lockouts++;
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
      log(t('log.termLockedNoPicks'), 'bad');
      S.advancing = true;
      updateButtons();
      setTimeout(() => endGame(false, 'picks'), 900);
      return;
    }
    log(t('log.termLockedPick', { n: S.picks }), 'bad');
    S.termLockLeft = CFG.ENDLESS_LOCKOUT * 1000;
  } else {
    S.termLockLeft = CFG.TERM_LOCKOUT * 1000;
    log(t('log.termLocked', { n: CFG.TERM_LOCKOUT }), 'bad');
  }
  Terminal.showLock(S.termLockLeft / 1000);
  updateButtons();
  saveRun();
}

function termReboot() {
  S.term = createTerm();
  S.termLockLeft = 0;
  renderStage();
  log(t('log.termReboot'));
  saveRun();
}

// ─── Сканер ──────────────────────────────────
function useScanner() {
  if (!canScanNow()) return;
  AudioEngine.init();
  if (isLock()) {
    const sharp = Math.pow(0.6, S.ups.sharpscan || 0);
    const drift = lockKind() === 'float' ? CFG.FLOAT_AMP : 0;
    const width = Math.max(tol() * 2 + 6, (tol() * 2 + 18) * sharp) + drift * 2;
    const slack = width - tol() * 2 - drift * 2;
    let a = S.targetBase - tol() - drift - Math.random() * slack;
    a = Math.max(-CFG.PICK_LIMIT, Math.min(CFG.PICK_LIMIT - width, a));
    S.scan = [a, a + width];
    log(t('log.scanLock'), 'good');
  } else {
    if (!Terminal.scan()) return;
    if (S.ups.sharpscan) Terminal.scan();
    log(t('log.scanTerm'), 'good');
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

// ─── Апгрейды (бесконечный режим) ────────────
function openUpgrade() {
  S.modalOpen = true;
  updateButtons();
  const pool = UPGRADES.slice();
  const offer = [];
  while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const box = $('upgradeOpts');
  box.innerHTML = '';
  offer.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = 'upgrade-btn';
    const lvl = S.ups[id] || 0;
    b.innerHTML = `<span class="opt-key">${i + 1}</span><span><b>${t(`up.${id}.name`)}${lvl ? ` (${lvl + 1})` : ''}</b><small>${t(`up.${id}.desc`)}</small></span>`;
    b.addEventListener('click', () => chooseUpgrade(id));
    box.appendChild(b);
  });
  upOverlay.classList.add('visible');
  Sound.good();
}

function chooseUpgrade(id) {
  if (!S.pendingUpgrade) return;
  S.pendingUpgrade = false;
  S.ups[id] = (S.ups[id] || 0) + 1;
  if (id === 'picks') { S.picks += 2; if (S.picks === 2) S.wear = 0; }
  if (id === 'scans') S.scanners += 2;
  updatePicks(true);
  updateWear();
  log(t('log.upgrade', { name: t(`up.${id}.name`) }), 'good');
  upOverlay.classList.remove('visible');
  S.modalOpen = false;
  Sound.click();
  nextStage();
}

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

  // Плавающий замок: точка медленно смещается
  if (lockKind() === 'float' && !S.advancing) {
    S.floatPhase += dt * CFG.FLOAT_SPEED;
    S.target = S.targetBase + Math.sin(S.floatPhase) * CFG.FLOAT_AMP;
  }

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
        S.st.jams++;
        setLamp('red');
        hintText.textContent = t('hint.jam');
        vibrate(30);
        Tutorial.show('jam', hackBtn, t('tut.jam'));
      }
      if (!(Tutorial.active && S.stage === 0)) {
        const w = wearRate() * dt;
        S.wear += w;
        S.st.wear += w;
      }
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
  if (S.turning) { hackTxt.textContent = t('btn.cylinder', { n: Math.floor(pct) }); hackTxt.dataset.state = 'turn'; }
  else if (!S.advancing && hackTxt.dataset.state === 'turn' && S.rot <= 0) { setHackIdle(); hackTxt.dataset.state = 'idle'; }
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
  const kind = lockKind();

  // Корпус (ржавый — с рыжими пятнами)
  const body = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, R);
  body.addColorStop(0, pri(0.12));
  body.addColorStop(1, pri(0.035));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  if (kind === 'rusty') {
    ctx.fillStyle = 'rgba(160,80,20,0.18)';
    [[0.6, 2.2, 14], [0.5, 1.4, 10], [0.3, -0.4, 8], [0.75, -0.2, 12]].forEach(([d, ang, r]) => {
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * R * d, cy + Math.sin(ang) * R * d, r, 0, Math.PI * 2); ctx.fill();
    });
  }
  ctx.strokeStyle = kind === 'rusty' ? 'rgba(170,95,35,0.8)' : pri(0.35); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
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

  // Индикатор штифтов двойного замка
  if (kind === 'double') {
    for (let i = 0; i < 2; i++) {
      const on = i < 2 - S.pinsLeft;
      ctx.fillStyle = on ? pri(1, 0.9) : pri(0.25);
      ctx.beginPath(); ctx.arc(cx - 8 + i * 16, cy + R * 0.86, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

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
    Tutorial.show('turn', hackBtn, t('tut.turn'));
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
  const n = parseInt(e.key, 10);

  if (upOverlay.classList.contains('visible')) {
    const ub = $('upgradeOpts').querySelectorAll('.upgrade-btn');
    if (n >= 1 && n <= ub.length) ub[n - 1].click();
    return;
  }
  if (S.modalOpen) {
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
  const st = cfg().endless ? t('pause.stage', { n: S.stage + 1 }) : t('pause.stageOf', { n: S.stage + 1, total: S.stages.length });
  const time = cfg().timeLimit ? t('pause.left', { time: fmtTime(S.timeLeft) }) : fmtTime(S.elapsed);
  $('pauseInfo').textContent = `${modeName(S.diff)} · ${st} · ${time}`;
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
const qLocal = (q) => q[LANG] || q.ru;

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
    log(t('log.reservePick'), 'good');
    modalRes.textContent = t('q.gotPick');
  } else {
    S.scanners++;
    log(t('log.reserveScan'), 'good');
    modalRes.textContent = t('q.gotScan');
  }
  updatePicks(true);
  S.cooldownLeft = (S.picks > 0 || cfg().endless) ? CFG.REQ_COOLDOWN_GOOD * 1000 : 0;
  Sound.good();
  saveRun();
}

function openQuestion() {
  S.modalOpen = true;
  turnStop();
  updateButtons();

  const q = nextQuestion();
  const loc = qLocal(q);
  const opts = shuffle(loc.opts.map((text, i) => ({ text, ok: i === q.ok })));

  modalTitle.textContent = t('q.title', { topic: QUESTION_TOPICS[q.cat][LANG] || QUESTION_TOPICS[q.cat].ru });
  modalQ.textContent = loc.text;
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
          modalRes.textContent = t('q.choose');
          modalRewards.hidden = false;
          Sound.good();
        }
      } else {
        S.stats.wrong++;
        P.wrong++;
        S.cooldownLeft = CFG.REQ_COOLDOWN_BAD * 1000;
        modalRes.textContent = t('q.denied', { n: CFG.REQ_COOLDOWN_BAD });
        modalRes.classList.add('bad');
        Sound.fail();
        log(t('log.idFailed'), 'bad');
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
const RUN_FIELDS = ['diff', 'stages', 'stage', 'done', 'stars', 'cleared', 'picks', 'scanners', 'scan', 'ups', 'pendingUpgrade',
  'wear', 'angle', 'target', 'targetBase', 'floatPhase', 'pinsLeft', 'term', 'termLockLeft', 'usedQs', 'cooldownLeft',
  'elapsed', 'timeLeft', 'st', 'stats'];

function saveRun() {
  if (!S.started || S.finished) return;
  const data = { v: 4, saved: Date.now(), journal: S.journal.slice(-100), tutorial: Tutorial.active ? Tutorial.seen : null };
  RUN_FIELDS.forEach((f) => { data[f] = S[f]; });
  if (S.advancing) data.advancing = true;
  try { localStorage.setItem(RUN_KEY, JSON.stringify(data)); } catch (e) {}
}

function clearRun() { localStorage.removeItem(RUN_KEY); }

function loadRun() {
  const r = loadJSON(RUN_KEY, null);
  if (!r || !(r.v >= 2 && r.v <= 4) || !DIFFS[r.diff]) return null;
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
  S.stars = r.stars || [];
  S.cleared = r.cleared != null ? r.cleared : r.done.filter(Boolean).length;
  S.picks = r.picks;
  S.scanners = r.scanners != null ? r.scanners : m.scanners;
  S.scan = r.scan || null;
  S.ups = r.ups || {};
  S.pendingUpgrade = !!r.pendingUpgrade;
  S.wear = r.wear;
  S.angle = r.angle;
  S.target = r.target;
  S.targetBase = r.targetBase != null ? r.targetBase : r.target;
  S.floatPhase = r.floatPhase || 0;
  S.pinsLeft = r.pinsLeft || 1;
  S.term = r.term;
  S.termLockLeft = r.termLockLeft || 0;
  S.usedQs = r.usedQs || [];
  S.cooldownLeft = r.cooldownLeft || 0;
  S.elapsed = r.elapsed || 0;
  S.timeLeft = r.timeLeft != null ? r.timeLeft : (m.timeLimit || 0);
  S.st = Object.assign({ t0: S.elapsed, broken: 0, wear: 0, jams: 0, lockouts: 0 }, r.st);
  S.stats = Object.assign({ broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 }, r.stats);
  S.journal = r.journal || [];
  S.advancing = false;
  ensureStages(S.stage + 2);
  updatePicks(false);
  updateWear();
  updateTimer();
  renderLog();
  if (r.advancing && S.done[S.stage] && !S.pendingUpgrade) {
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
  Object.assign(S, {
    started: false, finished: false, paused: false, modalOpen: false,
    stages: m.endless ? [] : m.stages.slice(),
    stage: 0, done: [], stars: [], cleared: 0,
    picks: m.picks, scanners: m.scanners, scan: null, ups: {}, pendingUpgrade: false,
    wear: 0, angle: 0, rot: 0, turning: false, jammed: false, advancing: false, flash: 0,
    term: null, termLockLeft: 0, cooldownLeft: 0, elapsed: 0, timeLeft: m.timeLimit || 0,
    stats: { broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 }, journal: [],
  });
  ensureStages(4);
  enterStage(true);
  updatePicks(false);
  updateWear();
  updateTimer();
  renderLog();
  canvas.classList.remove('success-glow');
  updateButtons();
}

function continueLabel(saved) {
  const d = DIFFS[saved.diff];
  const stg = d.endless ? t('pause.stage', { n: saved.stage + 1 }) : t('pause.stageOf', { n: saved.stage + 1, total: (saved.stages || d.stages).length });
  return t('start.continue', { mode: modeName(saved.diff), stage: stg });
}

function showStartScreen() {
  S.started = false;
  S.finished = false;
  const saved = loadRun();
  continueBtn.hidden = !saved;
  if (saved) {
    continueBtn.textContent = continueLabel(saved);
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
  if (S.pendingUpgrade) { S.advancing = true; openUpgrade(); }
}

function startNew() {
  clearRun();
  resetGame();
  P.runs++;
  saveProfile();
  Tutorial.start();
  beginPlaying();
  log(t('log.start', { mode: modeName(S.diff), picks: S.picks, scans: S.scanners }));
  if (cfg().timeLimit) log(t('log.guards', { time: fmtTime(cfg().timeLimit) }), 'bad');
  log(t('log.lockStage', { name: stageLabel(0), tol: tol() }));
  tutorialForStage();
  saveRun();
}

function continueRun() {
  const r = loadRun();
  Tutorial.active = !!(r && r.tutorial);
  Tutorial.seen = (r && r.tutorial) || {};
  beginPlaying();
  log(t('log.restored'));
}

function bestText(id) {
  const b = P.best[id];
  if (!b) return null;
  if (DIFFS[id].endless) return t('rec.stages', { n: b.stages });
  return fmtTime(b.time);
}

function showBest() {
  const b = P.best[chosenDiff];
  const name = modeName(chosenDiff);
  if (!b) bestLine.textContent = '';
  else if (DIFFS[chosenDiff].endless) bestLine.textContent = t('start.bestEndless', { mode: name, n: b.stages, time: fmtTime(b.time) });
  else bestLine.textContent = t('start.best', { mode: name, time: fmtTime(b.time), n: b.broken });
  $('modeDesc').textContent = t('mode.' + chosenDiff + '.desc');
}

function rankFor(broken, wrong, lockouts) {
  const score = broken + wrong * 0.5 + lockouts;
  if (score === 0) return 'ghost';
  if (score <= 1) return 'pro';
  if (score <= 3) return 'breaker';
  return 'brute';
}

function endlessRank(n) {
  if (n >= 20) return 'legend';
  if (n >= 12) return 'ghost';
  if (n >= 6) return 'pro';
  if (n >= 3) return 'breaker';
  return 'rookie';
}

function endGame(win) {
  if (S.finished) return;
  S.finished = true;
  S.paused = false;
  turnStop();
  clearRun();
  Tutorial.finish();
  updateButtons();

  const m = cfg();
  const time = S.elapsed;
  const starsGot = S.stars.reduce((a, s) => a + (s ? s.filter(Boolean).length : 0), 0);
  const starsMax = S.cleared * 3;
  let isRecord = false;
  let rank;
  let title;
  let lines;
  let cells;

  if (m.endless) {
    const prev = P.best[S.diff];
    isRecord = S.cleared > 0 && (!prev || S.cleared > prev.stages || (S.cleared === prev.stages && time < prev.time));
    if (isRecord) P.best[S.diff] = { stages: S.cleared, time, broken: S.stats.broken };
    rank = endlessRank(S.cleared);
    title = t('end.session');
    lines = [t('end.noPicks'), t('end.stagesDone', { n: S.cleared }), t('end.rank', { rank: t('rank.' + rank) })];
    cells = [[t('end.cellStages'), S.cleared + (isRecord ? ' ★' : '')], [t('end.cellTime'), fmtTime(time)], [t('end.cellStars'), `${starsGot}/${starsMax}`]];
    Sound.lockout();
  } else if (!win) {
    rank = 'fail';
    title = t('end.denied');
    lines = [t('end.guards'), t('end.mode', { mode: modeName(S.diff) }), t('end.stagesOf', { n: S.cleared, total: S.stages.length })];
    cells = [[t('end.cellStages'), `${S.cleared}/${S.stages.length}`], [t('end.cellBroken'), S.stats.broken], [t('end.cellStars'), `${starsGot}/${starsMax}`]];
    Sound.lockout();
    vibrate([200, 100, 200]);
  } else {
    const prev = P.best[S.diff];
    isRecord = !prev || time < prev.time;
    if (isRecord) P.best[S.diff] = { time, broken: S.stats.broken };
    rank = rankFor(S.stats.broken, S.stats.wrong, S.stats.lockouts);
    title = t('end.granted');
    lines = [t('end.allHacked'), t('end.mode', { mode: modeName(S.diff) }), t('end.rank', { rank: t('rank.' + rank) })];
    if (m.timeLimit) lines.splice(1, 0, t('end.guardsLeft', { time: fmtTime(S.timeLeft) }));
    cells = [[t('end.cellTime'), fmtTime(time) + (isRecord ? ' ★' : '')], [t('end.cellBroken'), S.stats.broken], [t('end.cellStars'), `${starsGot}/${starsMax}`]];
    Sound.win();
  }

  const counts = win || m.endless;
  if (counts) P.finished++;
  P.history.unshift({ d: Date.now(), diff: S.diff, time, broken: S.stats.broken, rank, stages: S.cleared, stars: starsGot, lost: !win && !m.endless });
  P.history = P.history.slice(0, 20);
  saveProfile();

  const gained = (win ? [
    'first',
    S.stats.broken === 0 && 'ghost',
    S.diff === 'hard' && 'master',
    S.diff === 'alarm' && 'alarm',
    (S.diff === 'normal' || S.diff === 'hard') && time < 120000 && 'speed',
    starsMax > 0 && starsGot === starsMax && 'perfect',
    LANG === 'en' && 'polyglot',
  ] : []).concat([counts && P.finished >= 10 && 'veteran']).filter((id) => id && unlock(id));

  const lost = !win && !m.endless;
  $('winBox').classList.toggle('lost', lost);
  $('endTitle').textContent = title;
  $('endMsg').innerHTML = '';
  lines.forEach((txt, i) => {
    const p = document.createElement('p');
    p.className = 'line-reveal';
    p.style.animationDelay = (0.3 + i * 0.6) + 's';
    p.textContent = txt;
    $('endMsg').appendChild(p);
  });
  $('stats').innerHTML = cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  $('stageStars').innerHTML = S.stages.map((st, i) => (S.done[i] ? `<span title="${stageLabel(i)}">${starStr(S.stars[i])}</span>` : '')).join('');
  $('newAch').innerHTML = gained.map((id) => `<div>★ ${t(`ach.${id}.name`)} — ${t(`ach.${id}.desc`)}</div>`).join('');
  log(`${title}. ${m.endless ? t('end.logStages', { n: S.cleared }) : t('end.logTime', { time: fmtTime(time) })}${isRecord ? ' ' + t('end.logRecord') : ''}`, lost ? 'bad' : 'good');

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
  Object.entries(QUESTION_TOPICS).forEach(([id, names]) => {
    const b = document.createElement('button');
    b.className = 'chip topic-btn' + (S.topics.includes(id) ? ' active' : '');
    b.textContent = names[LANG] || names.ru;
    b.setAttribute('aria-pressed', S.topics.includes(id));
    b.addEventListener('click', () => {
      AudioEngine.init();
      Sound.key();
      if (S.topics.includes(id)) {
        if (S.topics.length === 1) { toast(t('toast.oneTopic')); return; }
        S.topics = S.topics.filter((x) => x !== id);
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
// НАСТРОЙКИ И ЯЗЫК
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
  document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === LANG));
}

function setLanguage(lang) {
  if (lang === LANG || !I18N[lang]) return;
  LANG = lang;
  SETTINGS.lang = lang;
  saveSettings();
  applyStaticI18n();
  buildTopics();
  updateSoundBtn();
  showBest();
  syncSettingsUI();
  runBoot();
  if (S.stages.length) {
    updateBadges();
    updateButtons();
    if (!S.turning) setHackIdle();
    if (!isLock() && S.term) renderStage();
  }
  if (!continueBtn.hidden) {
    const saved = loadRun();
    if (saved) continueBtn.textContent = continueLabel(saved);
  }
  if (S.tab === 'stat') renderStat();
  if (S.tab === 'inv') renderInv();
  if (S.tab === 'data') renderData();
}

document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => {
  AudioEngine.init();
  Sound.key();
  setLanguage(b.dataset.lang);
}));

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
  toast(t('toast.tutorialOn'));
});

// ═══════════════════════════════════════════════
// ВКЛАДКИ
// ═══════════════════════════════════════════════
function switchTab(tab, silent) {
  if (tab !== 'hack') { turnStop(); Tutorial.hide(); }
  S.tab = tab;
  document.querySelectorAll('.tab').forEach((x) => {
    const on = x.dataset.tab === tab;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', on);
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

document.querySelectorAll('.tab').forEach((x) => x.addEventListener('click', () => {
  AudioEngine.init();
  Sound.key();
  switchTab(x.dataset.tab);
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
    ['stat.runs', P.runs],
    ['stat.finished', P.finished],
    ['stat.locks', P.locks],
    ['stat.terms', P.terms],
    ['stat.stars', P.stars],
    ['stat.broken', P.broken],
    ['stat.scans', P.scans],
    ['stat.lockouts', P.lockouts],
    ['stat.answers', answers ? `${P.right}/${answers} (${Math.round(P.right / answers * 100)}%)` : '—'],
    ['stat.lore', `${P.lore}/${LORE.length}`],
    ['stat.time', fmtLong(P.playMs)],
  ];
  const best = Object.keys(DIFFS).map((id) =>
    `<div class="rec"><span>${modeName(id)}</span><b>${bestText(id) || '--:--'}</b></div>`).join('');
  const got = ACHIEVEMENTS.filter((a) => P.ach[a.id]).length;
  $('statPane').innerHTML = `
    <h3>${t('stat.records')}</h3>
    <div class="records">${best}</div>
    <h3>${t('stat.numbers')}</h3>
    <div class="kv">${rows.map(([k, v]) => `<div><span>${t(k)}</span><b>${v}</b></div>`).join('')}</div>
    <h3>${t('stat.achievements', { n: got, total: ACHIEVEMENTS.length })}</h3>
    <div class="ach">${ACHIEVEMENTS.map((a) => {
      const has = !!P.ach[a.id];
      const secret = a.hidden && !has;
      return `
      <div class="ach-item ${has ? 'got' : ''} ${secret ? 'secret' : ''}">
        <span class="ach-icon">${has ? '★' : secret ? '?' : '☆'}</span>
        <span><b>${secret ? '???' : t(`ach.${a.id}.name`)}</b><br><small>${secret ? t('ach.hidden') : t(`ach.${a.id}.desc`)}</small></span>
      </div>`;
    }).join('')}
    </div>`;
}

function renderInv() {
  const inRun = S.started || loadRun();
  let picks = '';
  if (!inRun) {
    picks = `<div class="muted">${t('inv.noRun')}</div>`;
  } else if (S.picks <= 0) {
    picks = `<div class="muted">${t('inv.empty')}</div>`;
  } else {
    for (let i = 0; i < S.picks; i++) {
      const hp = i === 0 ? Math.round(100 - S.wear) : 100;
      picks += `<div class="inv-item"><span>${t('inv.pick', { n: i + 1 })}${i === 0 ? ' ' + t('inv.inLock') : ''}</span>${bar(hp, hp < 35 ? 'low' : '')}<b>${hp}%</b></div>`;
    }
  }
  const scanners = inRun
    ? (S.scanners > 0
      ? Array.from({ length: S.scanners }, (_, i) => `<div class="inv-item"><span>⌖ ${t('inv.scanner', { n: i + 1 })}</span><b>${t('inv.ready')}</b></div>`).join('')
      : `<div class="muted">${t('inv.noScanners')}</div>`)
    : '<div class="muted">—</div>';
  const ups = Object.entries(S.ups).filter(([, v]) => v > 0);
  const upsHtml = ups.length
    ? ups.map(([id, v]) => `<div class="inv-item"><span>${t(`up.${id}.name`)}</span><b>×${v}</b></div>`).join('')
    : `<div class="muted">${t('inv.noUps')}</div>`;
  let from = 0;
  let to = S.stages.length - 1;
  if (cfg().endless) { from = Math.max(0, S.stage - 4); to = S.stage + 1; ensureStages(to); }
  let keys = '';
  for (let i = from; i <= to; i++) {
    const st = S.stages[i];
    const kind = st.kind && st.kind !== 'normal' ? ` · ${t(`kind.${st.type}.${st.kind}`)}` : '';
    const state = S.done[i] ? starStr(S.stars[i]) : i === S.stage ? t('inv.current') : t('inv.closed');
    keys += `<div class="inv-item ${S.done[i] || i === S.stage ? '' : 'dim'}"><span>${S.done[i] ? '✓' : '·'} ${stageLabel(i)}${kind}</span><b>${state}</b></div>`;
  }
  $('invPane').innerHTML = `
    <h3>${t('inv.picks')}</h3>
    <div class="inv-list">${picks}</div>
    <h3>${t('inv.scanners')}</h3>
    <div class="inv-list">${scanners}</div>
    ${cfg().endless ? `<h3>${t('inv.upgrades')}</h3><div class="inv-list">${upsHtml}</div>` : ''}
    <h3>${t('inv.keys', { mode: modeName(S.diff) })}</h3>
    <div class="inv-list">${inRun ? keys : '<div class="muted">—</div>'}</div>
    <h3>${t('inv.run')}</h3>
    <div class="kv">
      <div><span>${t('end.cellTime')}</span><b>${fmtTime(S.elapsed)}</b></div>
      ${cfg().timeLimit ? `<div><span>${t('inv.guards')}</span><b>${fmtTime(S.timeLeft)}</b></div>` : ''}
      <div><span>${t('inv.cleared')}</span><b>${S.cleared}</b></div>
      <div><span>${t('stat.broken')}</span><b>${S.stats.broken}</b></div>
      <div><span>${t('inv.answers')}</span><b>${S.stats.right}/${S.stats.right + S.stats.wrong}</b></div>
      <div><span>${t('stat.lockouts')}</span><b>${S.stats.lockouts}</b></div>
    </div>`;
}

let resetArmed = false;
function renderData() {
  const hist = P.history.length
    ? P.history.map((h) => {
        const d = new Date(h.d);
        const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const mode = DIFFS[h.diff] ? modeName(h.diff) : h.diff;
        const res = h.diff === 'endless' ? t('rec.stages', { n: h.stages }) : h.lost ? t('rank.fail') : fmtTime(h.time);
        const rank = I18N.ru['rank.' + h.rank] ? t('rank.' + h.rank) : h.rank;
        return `<div class="hist ${h.lost ? 'lost' : ''}"><span>${date}</span><span>${mode}</span><b>${res}</b><span>✕${h.broken}</span><span class="hist-rank">${esc(rank)}</span></div>`;
      }).join('')
    : `<div class="muted">${t('data.empty')}</div>`;
  const journal = S.journal.length
    ? S.journal.slice().reverse().map((l) => `<div class="${l.k}"><span class="jt">${l.t}</span> ${esc(l.m)}</div>`).join('')
    : `<div class="muted">${t('data.empty')}</div>`;
  const lore = LORE.map((e, i) => {
    if (i >= P.lore) return `<div class="lore-item locked"><b>#${String(i + 1).padStart(2, '0')} ▒▒▒▒▒▒▒▒▒▒</b><small>${t('data.encrypted')}</small></div>`;
    const [title, text] = e[LANG] || e.ru;
    return `<details class="lore-item"${i === P.lore - 1 ? ' open' : ''}><summary><b>#${String(i + 1).padStart(2, '0')} ${esc(title)}</b></summary><p>${esc(text)}</p></details>`;
  }).join('');
  $('dataPane').innerHTML = `
    <h3>${t('data.archive', { n: P.lore, total: LORE.length })}</h3>
    <div class="lore">${lore}</div>
    <h3>${t('data.journal')}</h3>
    <div class="journal">${journal}</div>
    <h3>${t('data.history')}</h3>
    <div class="history">${hist}</div>
    <button class="link-btn danger" id="resetStatsBtn">${resetArmed ? t('data.resetConfirm') : t('data.reset')}</button>`;
  $('resetStatsBtn').addEventListener('click', () => {
    if (!resetArmed) { resetArmed = true; renderData(); setTimeout(() => { resetArmed = false; if (S.tab === 'data') renderData(); }, 3000); return; }
    resetArmed = false;
    Object.assign(P, emptyProfile());
    saveProfile();
    toast(t('toast.statsReset'));
    renderData();
  });
}

// ═══════════════════════════════════════════════
// ЭФФЕКТЫ
// ═══════════════════════════════════════════════
let bootTimer = null;
function runBoot() {
  clearTimeout(bootTimer);
  bootLog.innerHTML = '';
  const lines = t('boot').split('\n');
  let i = 0;
  const next = () => {
    if (i >= lines.length) return;
    const line = document.createElement('div');
    line.textContent = lines[i++];
    bootLog.appendChild(line);
    bootTimer = setTimeout(next, 180);
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
  const step = (time) => {
    rainRAF = requestAnimationFrame(step);
    if (time - last < 50) return;
    last = time;
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
applyStaticI18n();
applySettings();
syncSettingsUI();
selectDiff(S.diff);
buildTopics();
updateSoundBtn();
showStartScreen();
runBoot();
requestAnimationFrame(loop);
