'use strict';

// ═══════════════════════════════════════════════
// РЕЖИМЫ И ЭТАПЫ
// ═══════════════════════════════════════════════
// Замки: normal — обычный, rusty — износ ×2, double — два штифта подряд, float — точка плавает
// Терминалы: normal, hint — подсказка одной буквы, shuffle — дамп перемешивается после ошибки,
// trap — часть скобок оказывается ловушкой
const L = (tol, kind = 'normal') => ({ type: 'lock', tol, kind });
const T = (len, count, kind = 'normal') => ({ type: 'term', len, count, kind });
// Мини-игры: safe — сейф, wire — щиток, card — ключ-карта; lvl — сложность 1–3
const M = (type, lvl) => ({ type, lvl });

const NORMAL_STAGES = [L(10), T(6, 12, 'hint'), M('safe', 2), L(6.5, 'rusty'), M('wire', 2), T(7, 14, 'shuffle'), M('card', 2), L(5, 'double')];

const DIFFS = {
  easy:    { picks: 3, scanners: 2, wearRate: 55, stages: [L(14), T(5, 10), M('wire', 1), M('safe', 1), L(9)] },
  normal:  { picks: 2, scanners: 1, wearRate: 75, stages: NORMAL_STAGES },
  hard:    { picks: 1, scanners: 0, wearRate: 100, stages: [L(7, 'rusty'), T(7, 14, 'trap'), M('safe', 3), L(5, 'float'), M('wire', 3), T(8, 16, 'shuffle'), M('card', 3), L(3, 'double')] },
  alarm:   { picks: 2, scanners: 1, wearRate: 75, stages: NORMAL_STAGES, timeLimit: 210000, timeBonus: 15000 },
  endless: { picks: 2, scanners: 1, wearRate: 75, endless: true },
};
const modeName = (id) => t('mode.' + id);

const LOCK_KINDS = ['normal', 'rusty', 'double', 'float'];
const TERM_KINDS = ['normal', 'hint', 'shuffle', 'trap'];
const ODD_SLOTS = ['term', 'safe', 'term', 'wire', 'term', 'card'];

// Бесконечный режим: замки на чётных местах, между ними — терминалы и мини-игры
function endlessStage(n) {
  const k = Math.floor(n / 2);
  const pick = (arr) => (n < 4 ? 'normal' : arr[Math.floor(Math.random() * arr.length)]);
  if (n % 2 === 0) return L(Math.max(1.8, Math.round((12 - k * 1.4) * 10) / 10), pick(LOCK_KINDS));
  const slot = ODD_SLOTS[k % ODD_SLOTS.length];
  if (slot !== 'term') return M(slot, Math.min(3, 1 + Math.floor(k / 4)));
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
  STAR_MG_SEC: 45,
  MG_LOCKOUT: 8,
  EVENTS: true,
};

// Апгрейды бесконечного режима
const UPGRADES = ['durable', 'attempts', 'sharpscan', 'touch', 'picks', 'scans', 'brackets'];

const ACHIEVEMENTS = [
  { id: 'first' }, { id: 'ghost' }, { id: 'hacker' }, { id: 'master' }, { id: 'speed' },
  { id: 'alarm' }, { id: 'endless10' }, { id: 'endless25' }, { id: 'perfect' }, { id: 'rust' },
  { id: 'erudite' }, { id: 'brute' }, { id: 'veteran' }, { id: 'archivist' }, { id: 'polyglot' },
  { id: 'oneshot', hidden: true }, { id: 'cleaner', hidden: true }, { id: 'sapper', hidden: true },
  { id: 'analyst', hidden: true }, { id: 'night', hidden: true },
  { id: 'safecracker' }, { id: 'electrician' }, { id: 'swiper' }, { id: 'daredevil' },
  { id: 'shadow', hidden: true }, { id: 'darkhand', hidden: true },
];

// Модификаторы взлома: усложняют игру и уменьшают итоговое время (бонус в процентах)
const MODS = { noscan: 10, onepick: 15, fragile: 10, noreserve: 10, chaos: 5, blind: 10 };
const MOD_CAP = 40;
const modBonus = (mods) => Math.min(MOD_CAP, (mods || []).reduce((a, m) => a + (MODS[m] || 0), 0));
const adjTime = (ms, mods) => Math.round(ms * (1 - modBonus(mods) / 100));
const hasMod = (m) => S.mods.includes(m);

// Внешний вид: темы и отмычки открываются достижениями
const THEMES = [
  { id: 'green', sw: '#33ff33' }, { id: 'amber', sw: '#ffb000' }, { id: 'white', sw: '#e8f4ff' }, { id: 'cyan', sw: '#33e0ff' },
  { id: 'red', sw: '#ff5a46', ach: 'alarm' }, { id: 'gold', sw: '#ffd75a', ach: 'perfect' }, { id: 'violet', sw: '#c58cff', ach: 'night' },
];
const PICK_SKINS = [
  { id: 'steel', rgb: [175, 182, 172] },
  { id: 'brass', rgb: [214, 170, 86], ach: 'first' },
  { id: 'copper', rgb: [205, 112, 70], ach: 'rust' },
  { id: 'titan', rgb: [140, 165, 200], ach: 'ghost' },
  { id: 'bone', rgb: [232, 224, 200], ach: 'safecracker' },
  { id: 'gold', rgb: [255, 205, 60], ach: 'master' },
  { id: 'neon', rgb: null, ach: 'endless10' },
];
const cosmeticOpen = (c) => !c.ach || !!P.ach[c.ach];
const rewardOf = (achId) => {
  const th = THEMES.find((x) => x.ach === achId);
  if (th) return t('reward.theme', { name: t('theme.' + th.id) });
  const pk = PICK_SKINS.find((x) => x.ach === achId);
  if (pk) return t('reward.pick', { name: t('skin.' + pk.id) });
  return '';
};

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
  { volume: 80, vibro: true, crt: true, typing: true, large: false, theme: 'green', pick: 'steel', lang: LANG, stats: navigator.doNotTrack !== '1' },
  loadJSON(SETTINGS_KEY, {}),
);
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }

function unlock(id) {
  if (P.ach[id]) return false;
  P.ach[id] = Date.now();
  saveProfile();
  const name = t(`ach.${id}.name`);
  const reward = rewardOf(id);
  toast(t('toast.ach', { name }) + (reward ? ' · ' + reward : ''));
  log(t('log.ach', { name }) + (reward ? ' ' + reward : ''), 'good');
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
  runToken: null, // жетон сервера для таблицы рекордов
  mg: null,       // состояние мини-игры
  mods: [],       // модификаторы взлома
  event: null,    // идущее случайное событие
  eventAt: 0,     // когда случится следующее
  lbPlace: null,  // место в таблице после отправки результата
  stats: { broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 },
  journal: [],
};
if (!DIFFS[S.diff]) S.diff = 'normal';
let chosenDiff = S.diff;
let chosenMods = loadJSON('oz.mods', []).filter((m) => MODS[m]);

const cfg = () => DIFFS[S.diff];
const stageCfg = () => S.stages[S.stage];
const stType = () => { const st = stageCfg(); return st ? st.type : 'lock'; };
const isLock = () => stType() === 'lock';
const isTerm = () => stType() === 'term';
const isMg = () => MiniGames.TYPES.includes(stType());
const lockKind = () => (stageCfg() && stageCfg().kind) || 'normal';
const tol = () => stageCfg().tol + (S.ups.touch || 0) * 1.5;
const wearRate = () => cfg().wearRate * (lockKind() === 'rusty' ? 2 : 1) * (hasMod('fragile') ? 1.6 : 1) * Math.pow(0.75, S.ups.durable || 0);

function ensureStages(upto) {
  if (!cfg().endless) return;
  while (S.stages.length <= upto) S.stages.push(endlessStage(S.stages.length));
}

function stageLabel(i) {
  const st = S.stages;
  const n = st.slice(0, i + 1).filter((s) => s.type === st[i].type).length;
  return t('stage.' + st[i].type, { n });
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
const mgView = $('mgView');
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
  } else if (S.stages.length > 5) {
    // Длинный режим: окно из 5 этапов вокруг текущего
    from = Math.max(0, Math.min(S.stage - 2, S.stages.length - 5));
    to = from + 4;
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
  if (st.type === 'lock') lvlTitle.textContent = `[ ${prefix}${stageLabel(S.stage)}: ${protectionName(st.tol)} ]`;
  else if (st.type === 'term') lvlTitle.textContent = `[ ${prefix}${t('title.term', { n: stageLabel(S.stage).split(' ')[1], len: st.len })} ]`;
  else lvlTitle.textContent = `[ ${prefix}${stageLabel(S.stage)}: ${S.mg ? MiniGames.title(S.mg) : ''} ]`;
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
  if (blocked() || S.scanners <= 0 || (S.event && S.event.id === 'glitch')) return false;
  if (isLock()) return !S.scan && S.picks > 0;
  if (S.termLockLeft > 0) return false;
  return isTerm() ? Terminal.canScan() : MiniGames.canScan();
}

function updateButtons() {
  const b = blocked();
  hackBtn.disabled = b || S.picks <= 0 || !isLock();
  const cd = Math.ceil(S.cooldownLeft / 1000);
  const noRes = reserveOff();
  getPinBtn.disabled = b || cd > 0 || noRes;
  getPinBtn.textContent = noRes ? t('btn.reserveOff') : cd > 0 ? t('btn.cooldown', { n: cd }) : t('btn.reserve');
  getPinBtn.classList.toggle('attention', !getPinBtn.disabled && S.picks <= 0 && isLock() && !cfg().endless);
  scanBtn.disabled = !canScanNow();
  canvas.classList.toggle('disabled-canvas', b || S.picks <= 0);
  Terminal.setEnabled(!b && S.termLockLeft <= 0);
  MiniGames.setEnabled(!b && S.termLockLeft <= 0);
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

// Резерв недоступен: модификатор «без резерва» или нечего выдавать
function reserveOff() {
  if (hasMod('noreserve')) return true;
  return hasMod('noscan') && hasMod('onepick') && !cfg().endless;
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
  } else if (isTerm() && !Tutorial.seen.term1) {
    Tutorial.show('term1', termView, t('tut.term1'));
  }
}

// Первая встреча с мини-игрой: короткая подсказка (один раз, даже без обучения)
const MG_SEEN_KEY = 'oz.mgseen';
function mgIntro() {
  if (!isMg()) return;
  const seen = loadJSON(MG_SEEN_KEY, {});
  const type = stType();
  if (seen[type]) return;
  seen[type] = 1;
  localStorage.setItem(MG_SEEN_KEY, JSON.stringify(seen));
  const was = Tutorial.active;
  Tutorial.active = true;
  Tutorial.seen['mg_' + type] = false;
  Tutorial.show('mg_' + type, mgView, t('tut.' + type), true);
  Tutorial.active = was;
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
    S.mg = null;
  } else if (isTerm()) {
    S.mg = null;
    if (fresh || !S.term) {
      S.term = createTerm();
      S.termLockLeft = 0;
      S.scan = null;
    }
  } else {
    S.term = null;
    if (fresh || !S.mg || S.mg.type !== stType()) {
      S.mg = MiniGames.create(stType(), stageCfg().lvl);
      S.termLockLeft = 0;
      S.scan = null;
    }
  }
  if (fresh) planEvent();
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
  termView.hidden = !isTerm();
  mgView.hidden = !isMg();
  if (!isTerm()) termView.innerHTML = '';
  if (!isMg()) mgView.innerHTML = '';
  actionPanel.classList.toggle('hidden', !lock);
  setHackIdle();
  hackBar.style.width = '0%';
  setLamp('');
  if (lock) {
    resizeCanvas();
  } else if (isMg()) {
    MiniGames.setBlind(hasMod('blind'));
    MiniGames.mount(mgView, S.mg, {
      sound: (n, a) => Sound[n] && Sound[n](a),
      vibrate,
      onSolved: mgSolved,
      onLockout: mgLockout,
      onChange: () => { updateButtons(); saveRun(); },
    });
    MiniGames.showLock(S.termLockLeft / 1000);
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
  if (isMg()) return [sec <= CFG.STAR_MG_SEC * (S.mg && S.mg.lvl === 3 ? 1.3 : 1), S.st.lockouts === 0, MiniGames.clean(S.mg)];
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
    log(isLock() ? t('log.lockStage', { name: stageLabel(S.stage), tol: tol() })
      : isTerm() ? t('log.termStage', { len: stageCfg().len }) : t('log.mgStage', { name: stageLabel(S.stage) }));
    tutorialForStage();
    mgIntro();
    track('stage', { mode: S.diff, n: S.stage });
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
  if (S.event && S.event.id === 'blackout') unlock('darkhand');
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

function termLockout() { stageLockout(CFG.TERM_LOCKOUT, 'log.termLocked'); }

function mgLockout() {
  Sound.zap();
  stageLockout(CFG.MG_LOCKOUT, 'log.mgLocked');
}

function stageLockout(sec, msgKey) {
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
    S.termLockLeft = sec * 1000;
    log(t(msgKey, { n: sec }), 'bad');
  }
  showStageLock();
  updateButtons();
  saveRun();
}

function showStageLock() {
  if (isMg()) MiniGames.showLock(S.termLockLeft / 1000);
  else Terminal.showLock(S.termLockLeft / 1000);
}

function termReboot() {
  S.termLockLeft = 0;
  if (isMg()) { S.mg = MiniGames.create(stType(), stageCfg().lvl); log(t('log.mgReboot')); }
  else { S.term = createTerm(); log(t('log.termReboot')); }
  renderStage();
  saveRun();
}

// ─── Мини-игры ───────────────────────────────
function mgSolved(g) {
  Sound.granted();
  vibrate(40);
  P.mgs = (P.mgs || 0) + 1;
  if (g.type === 'safe' && g.errors === 0) unlock('safecracker');
  if (g.type === 'wire' && g.moves <= g.par) unlock('electrician');
  if (g.type === 'card' && g.errors === 0) unlock('swiper');
  saveProfile();
  completeStage('log.mgDone', { name: stageLabel(S.stage) });
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
  } else if (isMg()) {
    if (!MiniGames.scan()) return;
    log(t('log.scanMg'), 'good');
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
  const pool = UPGRADES.filter((id) => !((id === 'scans' || id === 'sharpscan') && hasMod('noscan')) && !(id === 'picks' && hasMod('onepick')));
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
    showStageLock();
    if (S.termLockLeft <= 0) termReboot();
  }

  updateEvent(dt);

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
  hackBar.style.width = (hasMod('blind') ? 0 : pct) + '%';
  hackBar.classList.toggle('jam', S.jammed);
  if (S.turning) { hackTxt.textContent = hasMod('blind') ? t('btn.cylinderBlind') : t('btn.cylinder', { n: Math.floor(pct) }); hackTxt.dataset.state = 'turn'; }
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

  // Шкала (в режиме «вслепую» её нет)
  for (let a = -90; a <= 90 && !hasMod('blind'); a += 5) {
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
    const skin = PICK_SKINS.find((x) => x.id === SETTINGS.pick) || PICK_SKINS[0];
    const base = skin.rgb || THEME.pri;
    const hot = [245, 97, 62];
    ctx.strokeStyle = `rgb(${base.map((v, i) => Math.round(v + (hot[i] - v) * w)).join(',')})`;
    if (!skin.rgb) { ctx.shadowColor = pri(1, 0.9); ctx.shadowBlur = 8; }
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, broken ? -len * 0.45 : -len + 6);
    if (!broken) ctx.arc(5, -len + 6, 5, Math.PI, Math.PI * 1.9, false);
    ctx.stroke();
    ctx.shadowBlur = 0;
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
  if (!mgView.hidden && S.tab === 'hack') MiniGames.frame(dt, now, S.started && !blocked() && S.termLockLeft <= 0);
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

  if ($('shareOverlay').classList.contains('visible')) {
    if (e.key === 'Escape') $('shareCloseBtn').click();
    return;
  }
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
  if (S.event && S.event.id === 'patrol' && S.event.watch && !blocked()) caught();
  if ((k === 's' || k === 'ы') && !scanBtn.disabled) { useScanner(); return; }
  if ((k === 'r' || k === 'к') && !getPinBtn.disabled) { getPinBtn.click(); return; }

  if (isTerm()) {
    AudioEngine.init();
    Terminal.handleKey(e);
    return;
  }
  if (isMg()) {
    AudioEngine.init();
    MiniGames.handleKey(e);
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
  const mods = S.mods.length ? ` · ⚑ ${S.mods.map((m) => t('mod.' + m)).join(', ')}` : '';
  $('pauseInfo').textContent = `${modeName(S.diff)} · ${st} · ${time}${mods}`;
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
  track('quit', { mode: S.diff, n: S.stage });
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
  if (kind === 'repair') {
    S.wear = 0;
    updateWear();
    log(t('log.reserveRepair'), 'good');
    modalRes.textContent = t('q.gotRepair');
  } else if (kind === 'pick') {
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
        const only = hasMod('noscan') ? 'pick' : hasMod('onepick') ? 'scan' : null;
        if (cfg().endless) {
          grantReward(hasMod('noscan') ? 'repair' : 'scan');
          showContinue();
        } else if (only) {
          grantReward(only);
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
  if (!blocked() && S.cooldownLeft <= 0 && !reserveOff()) openQuestion();
});
modalCont.addEventListener('click', closeQuestion);

// ═══════════════════════════════════════════════
// СОХРАНЕНИЕ ПРОГРЕССА
// ═══════════════════════════════════════════════
const RUN_FIELDS = ['diff', 'stages', 'stage', 'done', 'stars', 'cleared', 'picks', 'scanners', 'scan', 'ups', 'pendingUpgrade',
  'wear', 'angle', 'target', 'targetBase', 'floatPhase', 'pinsLeft', 'term', 'termLockLeft', 'usedQs', 'cooldownLeft',
  'elapsed', 'timeLeft', 'st', 'stats', 'runToken', 'mg', 'mods'];

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
  S.runToken = r.runToken || null;
  S.mg = r.mg || null;
  S.mods = Array.isArray(r.mods) ? r.mods.filter((m) => MODS[m]) : [];
  S.event = null;
  S.eventAt = 0;
  clearEventFx();
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
    stats: { broken: 0, right: 0, wrong: 0, lockouts: 0, scans: 0 }, journal: [], runToken: null,
    mg: null, mods: chosenMods.slice(), event: null, eventAt: 0, lbPlace: null,
  });
  if (hasMod('noscan')) S.scanners = 0;
  if (hasMod('onepick')) S.picks = 1;
  clearEventFx();
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
  MiniGames.resize();
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
  if (S.mods.length) log(t('log.mods', { list: S.mods.map((m) => t('mod.' + m)).join(', '), n: modBonus(S.mods) }), 'bad');
  track('start', { mode: S.diff, n: S.mods.length });
  if (cfg().timeLimit) log(t('log.guards', { time: fmtTime(cfg().timeLimit) }), 'bad');
  log(t('log.lockStage', { name: stageLabel(0), tol: tol() }));
  tutorialForStage();
  saveRun();
  requestRunToken();
}

function continueRun() {
  const r = loadRun();
  Tutorial.active = !!(r && r.tutorial);
  Tutorial.seen = (r && r.tutorial) || {};
  beginPlaying();
  log(t('log.restored'));
  mgIntro();
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
  S.event = null;
  S.eventAt = 0;
  clearEventFx();
  clearRun();
  Tutorial.finish();
  updateButtons();

  const m = cfg();
  const time = S.elapsed;
  const adj = adjTime(time, S.mods);
  const bonus = modBonus(S.mods);
  const timeCell = fmtTime(adj) + (bonus ? ` <small>−${bonus}%</small>` : '');
  const starsGot = S.stars.reduce((a, s) => a + (s ? s.filter(Boolean).length : 0), 0);
  const starsMax = S.cleared * 3;
  let isRecord = false;
  let rank;
  let title;
  let lines;
  let cells;

  if (m.endless) {
    const prev = P.best[S.diff];
    isRecord = S.cleared > 0 && (!prev || S.cleared > prev.stages || (S.cleared === prev.stages && adj < prev.time));
    if (isRecord) P.best[S.diff] = { stages: S.cleared, time: adj, broken: S.stats.broken, mods: S.mods.slice() };
    rank = endlessRank(S.cleared);
    title = t('end.session');
    lines = [t('end.noPicks'), t('end.stagesDone', { n: S.cleared }), t('end.rank', { rank: t('rank.' + rank) })];
    cells = [[t('end.cellStages'), S.cleared + (isRecord ? ' ★' : '')], [t('end.cellTime'), timeCell], [t('end.cellStars'), `${starsGot}/${starsMax}`]];
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
    isRecord = !prev || adj < prev.time;
    if (isRecord) P.best[S.diff] = { time: adj, broken: S.stats.broken, mods: S.mods.slice() };
    rank = rankFor(S.stats.broken, S.stats.wrong, S.stats.lockouts);
    title = t('end.granted');
    lines = [t('end.allHacked'), t('end.mode', { mode: modeName(S.diff) }), t('end.rank', { rank: t('rank.' + rank) })];
    if (m.timeLimit) lines.splice(1, 0, t('end.guardsLeft', { time: fmtTime(S.timeLeft) }));
    cells = [[t('end.cellTime'), timeCell + (isRecord ? ' ★' : '')], [t('end.cellBroken'), S.stats.broken], [t('end.cellStars'), `${starsGot}/${starsMax}`]];
    Sound.win();
  }

  const counts = win || m.endless;
  if (counts) P.finished++;
  P.history.unshift({ d: Date.now(), diff: S.diff, time: adj, broken: S.stats.broken, rank, stages: S.cleared, stars: starsGot, lost: !win && !m.endless });
  P.history = P.history.slice(0, 20);
  saveProfile();

  const gained = (win ? [
    'first',
    S.stats.broken === 0 && 'ghost',
    S.diff === 'hard' && 'master',
    S.diff === 'alarm' && 'alarm',
    (S.diff === 'normal' || S.diff === 'hard') && adj < 240000 && 'speed',
    starsMax > 0 && starsGot === starsMax && 'perfect',
    LANG === 'en' && 'polyglot',
    !m.endless && S.mods.length >= 3 && 'daredevil',
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
  $('newAch').innerHTML = gained.map((id) => `<div>★ ${t(`ach.${id}.name`)} — ${t(`ach.${id}.desc`)}${rewardOf(id) ? ` <i>${rewardOf(id)}</i>` : ''}</div>`).join('');
  log(`${title}. ${m.endless ? t('end.logStages', { n: S.cleared }) : t('end.logTime', { time: fmtTime(adj) })}${isRecord ? ' ' + t('end.logRecord') : ''}`, lost ? 'bad' : 'good');

  SHARE.result = {
    mode: S.diff, win: !!win, lost, endless: !!m.endless, time: adj, raw: time, bonus, mods: S.mods.slice(),
    stages: S.cleared, total: S.stages.length, stars: starsGot, starsMax, broken: S.stats.broken, rank, title, d: Date.now(),
  };
  $('shareBtn').hidden = false;
  winOverlay.classList.add('visible');
  startRain(lost);
  track(lost ? 'fail' : 'finish', { mode: S.diff, n: S.cleared });
  lbAfterGame(win || m.endless, starsGot);
}

startBtn.addEventListener('click', startNew);
continueBtn.addEventListener('click', continueRun);
restartBtn.addEventListener('click', () => {
  Sound.click();
  winOverlay.classList.remove('visible');
  $('shareOverlay').classList.remove('visible');
  stopRain();
  showStartScreen();
});
$('lbLinkBtn').addEventListener('click', () => {
  AudioEngine.init();
  Sound.click();
  startOverlay.classList.remove('visible');
  switchTab('top');
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
  const th = THEMES.find((x) => x.id === SETTINGS.theme);
  if (!th || !cosmeticOpen(th)) SETTINGS.theme = 'green';
  const sk = PICK_SKINS.find((x) => x.id === SETTINGS.pick);
  if (!sk || !cosmeticOpen(sk)) SETTINGS.pick = 'steel';
  if (SETTINGS.theme && SETTINGS.theme !== 'green') html.dataset.theme = SETTINGS.theme;
  else delete html.dataset.theme;
  html.classList.toggle('large', !!SETTINGS.large);
  html.classList.toggle('no-crt', !SETTINGS.crt);
  AudioEngine.setVolume(SETTINGS.volume / 100);
  Terminal.setTyping(!!SETTINGS.typing);
  readTheme();
  if (isLock()) resizeCanvas();
  MiniGames.resize();
}

function syncSettingsUI() {
  $('setVolume').value = SETTINGS.volume;
  $('setVolumeVal').textContent = SETTINGS.volume + '%';
  $('setVibro').checked = SETTINGS.vibro;
  $('setCrt').checked = SETTINGS.crt;
  $('setTyping').checked = SETTINGS.typing;
  $('setLarge').checked = SETTINGS.large;
  $('setStats').checked = !!SETTINGS.stats;
  buildCosmetics();
  document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === LANG));
}

function setLanguage(lang) {
  if (lang === LANG || !I18N[lang]) return;
  LANG = lang;
  SETTINGS.lang = lang;
  saveSettings();
  applyStaticI18n();
  buildTopics();
  buildMods();
  updateSoundBtn();
  showBest();
  syncSettingsUI();
  runBoot();
  if (S.stages.length) {
    updateBadges();
    updateButtons();
    if (!S.turning) setHackIdle();
    if (!isLock()) renderStage();
    paintEventBar();
  }
  if (!continueBtn.hidden) {
    const saved = loadRun();
    if (saved) continueBtn.textContent = continueLabel(saved);
  }
  if (S.tab === 'stat') renderStat();
  if (S.tab === 'inv') renderInv();
  if (S.tab === 'data') renderData();
  if (S.tab === 'top') renderTop();
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
[['setVibro', 'vibro'], ['setCrt', 'crt'], ['setTyping', 'typing'], ['setLarge', 'large'], ['setStats', 'stats']].forEach(([id, key]) => {
  $(id).addEventListener('change', (e) => {
    SETTINGS[key] = e.target.checked;
    saveSettings();
    applySettings();
    AudioEngine.init();
    Sound.key();
    if (key === 'vibro' && SETTINGS.vibro) vibrate(40);
  });
});
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
  if (tab === 'top') renderTop();
  if (tab === 'hack' && !silent) {
    lastT = performance.now();
    if (!S.started && !S.finished) showStartScreen();
    else if (isLock()) resizeCanvas();
    else MiniGames.resize();
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
    ['stat.mgs', P.mgs || 0],
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
        <span><b>${secret ? '???' : t(`ach.${a.id}.name`)}</b><br><small>${secret ? t('ach.hidden') : t(`ach.${a.id}.desc`)}</small>${!secret && rewardOf(a.id) ? `<br><small class="ach-reward">${rewardOf(a.id)}</small>` : ''}</span>
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
// ТАБЛИЦА РЕКОРДОВ (сервер: api/)
// ═══════════════════════════════════════════════
const PLAYER_KEY = 'oz.player';
const PLAYER = (() => {
  const p = loadJSON(PLAYER_KEY, {});
  if (!p.id || !/^[a-z0-9]{16,40}$/.test(p.id)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    p.id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  p.name = p.name || '';
  localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
  return p;
})();
function savePlayer() { localStorage.setItem(PLAYER_KEY, JSON.stringify(PLAYER)); }

const LB = { mode: null, data: null, error: null, loading: false, pending: null };

async function api(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const opts = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }
      : { signal: ctrl.signal };
    const r = await fetch('api/' + path, opts);
    return await r.json().catch(() => ({ ok: false, error: 'server' }));
  } catch (e) {
    return { ok: false, error: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

const errText = (code) => t(I18N.ru['err.' + code] ? 'err.' + code : 'err.generic');

async function requestRunToken() {
  const diff = S.diff;
  const r = await api('run', { mode: diff });
  // Игрок мог успеть выйти в меню и начать другой взлом
  if (r.ok && S.started && S.diff === diff && !S.runToken) {
    S.runToken = r.token;
    saveRun();
  }
}

function lbBox(html) { $('lbBox').innerHTML = html; }

function lbAfterGame(counts, stars) {
  lbBox('');
  if (!counts) return;
  if (!S.runToken) { lbBox(`<div class="muted">${t('end.lbUnavailable')}</div>`); return; }
  LB.pending = {
    token: S.runToken, mode: S.diff,
    time: Math.round(S.elapsed), stages: S.cleared, broken: S.stats.broken, stars, mods: S.mods.slice(),
  };
  S.runToken = null;
  if (PLAYER.name) submitPending();
  else askName();
}

function askName() {
  lbBox(`
    <div class="lb-ask">${t('end.lbNeedName')}</div>
    <form class="callsign" id="endNameForm">
      <input type="text" id="endNameInput" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="${esc(t('lb.placeholder'))}">
      <button type="submit" class="chip">${t('end.lbSend')}</button>
    </form>
    <div class="lb-msg" id="endNameMsg"></div>`);
  $('endNameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('endNameInput').value.replace(/\s+/g, ' ').trim();
    const err = localNameError(name);
    if (err) { $('endNameMsg').textContent = t('err.' + err); return; }
    PLAYER.name = name;
    savePlayer();
    submitPending();
  });
}

function localNameError(name) {
  if (name.length < 2 || name.length > 16) return 'name_length';
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(name)) return 'name_chars';
  return null;
}

async function submitPending() {
  if (!LB.pending) return;
  lbBox(`<div class="muted">${t('end.lbSending')}</div>`);
  const r = await api('score', Object.assign({ id: PLAYER.id, name: PLAYER.name }, LB.pending));
  if (r.ok) {
    LB.pending = null;
    LB.data = null;
    if (SHARE.result) SHARE.result.place = { rank: r.rank, total: r.total };
    track('lb', { mode: SHARE.result ? SHARE.result.mode : S.diff });
    lbBox(`
      <div class="lb-place">${t('end.lbPlace', { rank: r.rank, total: r.total })}</div>
      <div class="muted">${t(r.best ? 'end.lbBest' : 'end.lbNotBest')}</div>
      <button class="link-btn" id="endLbOpen">${t('end.lbOpen')}</button>`);
    log(t('log.lbPlace', { rank: r.rank, total: r.total }), 'good');
    $('endLbOpen').addEventListener('click', openLbFromEnd);
    return;
  }
  if (r.error && r.error.startsWith('name_')) { PLAYER.name = ''; savePlayer(); askName(); $('endNameMsg').textContent = t('err.' + r.error); return; }
  if (!r.error || ['not_configured', 'offline', 'server'].includes(r.error)) { LB.pending = null; lbBox(`<div class="muted">${t('end.lbUnavailable')}</div>`); return; }
  LB.pending = null;
  lbBox(`<div class="muted">${t('end.lbRejected', { reason: errText(r.error) })}</div>`);
}

function openLbFromEnd() {
  Sound.click();
  LB.mode = S.diff;
  winOverlay.classList.remove('visible');
  stopRain();
  showStartScreen();
  startOverlay.classList.remove('visible');
  switchTab('top');
}

function lbResult(row, mode) {
  const mods = row.mods && row.mods.length
    ? ` <small class="lb-mods" title="${esc(row.mods.map((x) => (MODS[x] ? t('mod.' + x) : x)).join(', '))}">⚑${row.mods.length}</small>` : '';
  if (DIFFS[mode].endless) return `${t('rec.stages', { n: row.stages })} <small>${fmtTime(row.time)}</small>${mods}`;
  return fmtTime(row.time) + mods;
}

async function renderTop() {
  if (!LB.mode) LB.mode = chosenDiff;
  $('callsignInput').placeholder = t('lb.placeholder');
  if (document.activeElement !== $('callsignInput')) $('callsignInput').value = PLAYER.name;
  $('lbModes').innerHTML = Object.keys(DIFFS).map((id) =>
    `<button class="chip lb-mode${id === LB.mode ? ' active' : ''}" data-mode="${id}">${modeName(id)}</button>`).join('');
  $('lbModes').querySelectorAll('.lb-mode').forEach((b) => b.addEventListener('click', () => {
    Sound.key();
    LB.mode = b.dataset.mode;
    LB.data = null;
    renderTop();
  }));
  const mode = LB.mode;
  if (!LB.data || LB.data.mode !== mode) {
    $('lbList').innerHTML = `<div class="muted">${t('lb.loading')}</div>`;
    $('lbMe').innerHTML = '';
    if (LB.loading) return;
    LB.loading = true;
    const r = await api(`leaderboard?mode=${mode}&id=${PLAYER.id}`);
    LB.loading = false;
    if (LB.mode !== mode) { renderTop(); return; }
    LB.data = r.ok && Array.isArray(r.top) ? r : { mode, error: r.error || 'server' };
  }
  const d = LB.data;
  if (d.error) {
    $('lbList').innerHTML = `<div class="muted">${t(d.error === 'not_configured' ? 'lb.notConfigured' : 'lb.offline')}</div>`;
    $('lbMe').innerHTML = '';
    return;
  }
  if (!d.top.length) {
    $('lbList').innerHTML = `<div class="muted">${t('lb.empty')}</div>`;
  } else {
    $('lbList').innerHTML = d.top.map((row) => `
      <div class="lb-row${row.me ? ' me' : ''}${row.rank <= 3 ? ' podium' : ''}">
        <span class="lb-rank">${row.rank}</span>
        <span class="lb-name">${esc(row.name)}${row.me ? ` <i>${t('lb.you')}</i>` : ''}</span>
        <b class="lb-res">${lbResult(row, mode)}</b>
        <span class="lb-extra">✕${row.broken} ★${row.stars}</span>
      </div>`).join('');
  }
  $('lbMe').innerHTML = `${d.me ? t('lb.yourPlace', { rank: d.me.rank, total: d.total }) : t('lb.notRanked')}<br><span class="muted">${t('lb.total', { n: d.total })}</span>`;
}

$('lbRefresh').addEventListener('click', () => { Sound.click(); LB.data = null; renderTop(); });
$('callsignForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('callsignInput').value.replace(/\s+/g, ' ').trim();
  const err = localNameError(name);
  if (err) { $('callsignMsg').textContent = t('err.' + err); return; }
  const r = await api('name', { id: PLAYER.id, name });
  if (!r.ok && r.error && r.error.startsWith('name_')) { $('callsignMsg').textContent = t('err.' + r.error); return; }
  PLAYER.name = name;
  savePlayer();
  Sound.good();
  $('callsignMsg').textContent = t('lb.saved');
  LB.data = null;
  renderTop();
});

// ═══════════════════════════════════════════════
// СЛУЧАЙНЫЕ СОБЫТИЯ
// blackout — свет гаснет, виден только круг фонарика; patrol — шаги охраны: замри;
// glitch — помехи, сканер не работает; stash — тайник; guards — охрана отвлеклась (+время)
// ═══════════════════════════════════════════════
const EVENT_CHANCE = { easy: 0.15, normal: 0.3, hard: 0.4, alarm: 0.35, endless: 0.3 };
const EVENT_DUR = { blackout: 9000, patrol: 7000, glitch: 8000 };
const PATROL_GRACE = 1500;
const eventBar = $('eventBar');
const hackPane = document.querySelector('.pane[data-pane="hack"]');

function planEvent() {
  S.eventAt = 0;
  if (!CFG.EVENTS || S.stage < 1 || Tutorial.active) return;
  let p = EVENT_CHANCE[S.diff] || 0.3;
  if (hasMod('chaos')) p = Math.min(0.9, p * 2 + 0.2);
  if (Math.random() < p) S.eventAt = S.elapsed + 3000 + Math.random() * 7000;
}

function pickEvent() {
  const pool = ['blackout', 'blackout', 'patrol', 'patrol', 'glitch', 'stash'];
  if (cfg().timeLimit) pool.push('guards');
  return pool[Math.floor(Math.random() * pool.length)];
}

function updateEvent(dt) {
  if (S.advancing || S.modalOpen) return;
  if (!S.event && S.eventAt && S.elapsed >= S.eventAt) { S.eventAt = 0; startEvent(pickEvent()); return; }
  const e = S.event;
  if (!e) return;
  e.left -= dt * 1000;
  if (e.id === 'patrol') {
    if (!e.watch && e.left < EVENT_DUR.patrol - PATROL_GRACE) { e.watch = true; hackPane.classList.add('ev-watch'); }
    if (e.watch && S.turning) { caught(); return; }
  }
  if (e.left <= 0) { endEvent(true); return; }
  paintEventBar();
}

function startEvent(id) {
  if (id === 'stash') { stash(); return; }
  if (id === 'guards') {
    S.timeLeft += 20000;
    toast(t('ev.guards'));
    log(t('ev.guards'), 'good');
    Sound.good();
    return;
  }
  S.event = { id, left: EVENT_DUR[id], watch: false };
  hackPane.classList.add('ev-' + id);
  if (id === 'patrol') { Sound.steps(); vibrate([30, 60, 30]); } else Sound.event();
  log(t('ev.' + id + '.log'), 'bad');
  paintEventBar();
  updateButtons();
}

function stash() {
  let kind = Math.random() < 0.5 ? 'pick' : 'scan';
  if (hasMod('noscan')) kind = 'pick';
  if (hasMod('onepick')) kind = 'scan';
  if (kind === 'pick' && S.picks >= CFG.ENDLESS_MAX_PICKS) kind = 'scan';
  if (kind === 'scan' && hasMod('noscan')) kind = 'repair';
  if (kind === 'pick') { S.picks++; if (S.picks === 1) S.wear = 0; } else if (kind === 'scan') S.scanners++; else S.wear = 0;
  updatePicks(true);
  updateWear();
  updateButtons();
  toast(t('ev.stash.' + kind));
  log(t('ev.stash.' + kind), 'good');
  Sound.good();
  saveRun();
}

function caught() {
  const e = S.event;
  if (!e || e.id !== 'patrol' || e.caught) return;
  e.caught = true;
  Sound.alert();
  vibrate([100, 50, 100]);
  let msg;
  if (cfg().timeLimit) { S.timeLeft = Math.max(1000, S.timeLeft - 20000); msg = t('ev.caught.time'); }
  else if (S.scanners > 0) { S.scanners--; msg = t('ev.caught.scan'); }
  else if (S.picks > 0 && isLock()) { S.wear = Math.min(95, S.wear + 35); msg = t('ev.caught.wear'); }
  else { S.cooldownLeft = Math.max(S.cooldownLeft, 15000); msg = t('ev.caught.reserve'); }
  toast(msg);
  log(msg, 'bad');
  updatePicks(true);
  updateWear();
  endEvent(false);
  saveRun();
}

function endEvent(ok) {
  const e = S.event;
  if (!e) return;
  S.event = null;
  clearEventFx();
  if (e.id === 'patrol' && ok && !e.caught) {
    P.patrols = (P.patrols || 0) + 1;
    saveProfile();
    toast(t('ev.patrol.gone'));
    log(t('ev.patrol.gone'), 'good');
    if (P.patrols >= 3) unlock('shadow');
  } else if (ok) log(t('ev.' + e.id + '.end'));
  updateButtons();
}

function clearEventFx() {
  ['ev-blackout', 'ev-patrol', 'ev-glitch', 'ev-watch'].forEach((c) => hackPane.classList.remove(c));
  eventBar.hidden = true;
}

function paintEventBar() {
  const e = S.event;
  if (!e) { eventBar.hidden = true; return; }
  eventBar.hidden = false;
  eventBar.className = 'event-bar ev-' + e.id + (e.watch ? ' watch' : '');
  const n = Math.ceil(e.left / 1000);
  eventBar.textContent = e.id === 'patrol' && !e.watch ? t('ev.patrol.warn') : t('ev.' + e.id + '.bar', { n });
}

// Патруль слышит любое действие на экране взлома
hackPane.addEventListener('pointerdown', () => {
  if (S.event && S.event.id === 'patrol' && S.event.watch && !blocked()) caught();
}, true);
// Фонарик в темноте следует за пальцем или курсором
hackPane.addEventListener('pointermove', (e) => {
  if (!S.event || S.event.id !== 'blackout') return;
  const r = hackPane.getBoundingClientRect();
  hackPane.style.setProperty('--fx', (e.clientX - r.left) + 'px');
  hackPane.style.setProperty('--fy', (e.clientY - r.top) + 'px');
});

// ═══════════════════════════════════════════════
// МОДИФИКАТОРЫ (стартовый экран)
// ═══════════════════════════════════════════════
function buildMods() {
  const box = $('mods');
  box.innerHTML = '';
  Object.keys(MODS).forEach((id) => {
    const on = chosenMods.includes(id);
    const b = document.createElement('button');
    b.className = 'chip mod-btn' + (on ? ' active' : '');
    b.dataset.mod = id;
    b.textContent = t('mod.' + id);
    b.title = t('mod.' + id + '.desc');
    b.setAttribute('aria-pressed', on);
    b.addEventListener('click', () => {
      AudioEngine.init();
      Sound.key();
      chosenMods = on ? chosenMods.filter((x) => x !== id) : chosenMods.concat(id);
      localStorage.setItem('oz.mods', JSON.stringify(chosenMods));
      buildMods();
      if (continueBtn.hidden) resetGame();
    });
    box.appendChild(b);
  });
  const bonus = modBonus(chosenMods);
  $('modsDesc').textContent = bonus
    ? t('mods.bonus', { n: bonus, list: chosenMods.map((m) => t('mod.' + m + '.desc')).join(' ') })
    : t('mods.none');
}

// ═══════════════════════════════════════════════
// ВНЕШНИЙ ВИД: темы и отмычки за достижения
// ═══════════════════════════════════════════════
function lockedToast(c) {
  const a = ACHIEVEMENTS.find((x) => x.id === c.ach);
  toast(t('toast.lockedBy', { name: a && a.hidden ? '???' : t(`ach.${c.ach}.name`) }));
  Sound.denied();
}

function buildCosmetics() {
  $('themes').innerHTML = THEMES.map((th) => {
    const open = cosmeticOpen(th);
    return `<button class="chip theme-btn${SETTINGS.theme === th.id ? ' active' : ''}${open ? '' : ' locked'}" data-theme="${th.id}" style="--sw:${th.sw}">${open ? '' : '🔒'}${t('theme.' + th.id)}</button>`;
  }).join('');
  $('skins').innerHTML = PICK_SKINS.map((sk) => {
    const open = cosmeticOpen(sk);
    const sw = sk.rgb ? `rgb(${sk.rgb.join(',')})` : 'var(--green-bright)';
    return `<button class="chip theme-btn skin-btn${SETTINGS.pick === sk.id ? ' active' : ''}${open ? '' : ' locked'}" data-skin="${sk.id}" style="--sw:${sw}">${open ? '' : '🔒'}${t('skin.' + sk.id)}</button>`;
  }).join('');
}

$('themes').addEventListener('click', (e) => {
  const b = e.target.closest('.theme-btn');
  if (!b) return;
  AudioEngine.init();
  const th = THEMES.find((x) => x.id === b.dataset.theme);
  if (!cosmeticOpen(th)) { lockedToast(th); return; }
  SETTINGS.theme = th.id;
  saveSettings();
  applySettings();
  syncSettingsUI();
  Sound.key();
});
$('skins').addEventListener('click', (e) => {
  const b = e.target.closest('.skin-btn');
  if (!b) return;
  AudioEngine.init();
  const sk = PICK_SKINS.find((x) => x.id === b.dataset.skin);
  if (!cosmeticOpen(sk)) { lockedToast(sk); return; }
  SETTINGS.pick = sk.id;
  saveSettings();
  syncSettingsUI();
  Sound.key();
});

// ═══════════════════════════════════════════════
// КАРТОЧКА РЕЗУЛЬТАТА
// ═══════════════════════════════════════════════
const SHARE = { result: null, blob: null, url: null };
const SITE = 'oz-terminal.vercel.app';

function shareText(r) {
  const res = r.endless ? t('rec.stages', { n: r.stages }) : r.lost ? t('share.lostRes', { n: r.stages, total: r.total }) : fmtTime(r.time);
  const place = r.place ? ' ' + t('share.place', { rank: r.place.rank, total: r.place.total }) : '';
  return t(r.lost ? 'share.textLost' : 'share.text', { mode: modeName(r.mode), res, stars: r.stars, max: r.starsMax, place }) + ' https://' + SITE;
}

async function makeCard(r) {
  try { await Promise.all([document.fonts.load('100px VT323'), document.fonts.load('40px "Ubuntu Mono"')]); } catch (e) {}
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--bg-deep').trim() || '#020502';
  const red = '#ff3b3b';
  const main = r.lost ? red : pri(1);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.42, W * 0.8);
  glow.addColorStop(0, pri(1, 0.12));
  glow.addColorStop(1, pri(1, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = pri(1, 0.55);
  g.lineWidth = 4;
  g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = pri(1, 0.2);
  g.lineWidth = 2;
  g.strokeRect(56, 56, W - 112, H - 112);

  const text = (s, y, size, color, font = 'VT323', blur = 18) => {
    g.font = `${size}px ${font === 'VT323' ? 'VT323' : '"Ubuntu Mono"'}, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = blur;
    let fit = size;
    while (g.measureText(s).width > W - 160 && fit > 20) { fit -= 4; g.font = `${fit}px ${font === 'VT323' ? 'VT323' : '"Ubuntu Mono"'}, monospace`; }
    g.fillText(s, W / 2, y);
    g.shadowBlur = 0;
  };

  text('OZ-TERMINAL', 190, 130, pri(1), 'VT323', 28);
  text(t('share.sub'), 245, 34, pri(0.7), 'mono', 0);
  text(r.title, 360, 66, main, 'mono', 20);
  text(t('share.mode', { mode: modeName(r.mode) }), 430, 40, pri(0.85), 'mono', 0);
  const big = r.endless ? t('share.stagesBig', { n: r.stages }) : r.lost ? `${r.stages}/${r.total}` : fmtTime(r.time);
  text(big, 650, 230, r.lost ? red : acc(1), 'VT323', 34);
  if (r.bonus) text(t('share.mods', { n: r.bonus, list: r.mods.map((m) => t('mod.' + m)).join(' · ') }), 720, 30, acc(0.85), 'mono', 0);
  text(`★ ${r.stars} / ${r.starsMax}`, 820, 72, pri(1), 'VT323', 16);

  const cells = [
    [t('end.cellBroken'), String(r.broken)],
    [t('share.cellStages'), r.endless ? String(r.stages) : `${r.stages}/${r.total}`],
    [t('share.cellPlace'), r.place ? `#${r.place.rank}` : '—'],
  ];
  const cw = 280;
  const gap = 30;
  const x0 = (W - cw * 3 - gap * 2) / 2;
  cells.forEach(([k, v], i) => {
    const x = x0 + i * (cw + gap);
    g.strokeStyle = pri(1, 0.4);
    g.lineWidth = 3;
    g.strokeRect(x, 880, cw, 150);
    g.font = '30px "Ubuntu Mono", monospace';
    g.fillStyle = pri(0.7);
    g.textAlign = 'center';
    g.fillText(k, x + cw / 2, 930);
    g.font = '80px VT323, monospace';
    g.fillStyle = pri(1);
    g.fillText(v, x + cw / 2, 1005);
  });
  if (!r.lost) text(t('end.rank', { rank: t('rank.' + r.rank) }), 1100, 38, pri(0.85), 'mono', 0);
  text(t('share.cta'), 1185, 46, acc(1), 'mono', 10);
  text(SITE, 1255, 52, pri(1), 'mono', 14);

  // Строки развёртки, как на экране терминала
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
  return c;
}

async function openShare() {
  const r = SHARE.result;
  if (!r) return;
  AudioEngine.init();
  Sound.click();
  $('shareOverlay').classList.add('visible');
  $('shareImg').removeAttribute('src');
  $('shareNote').textContent = t('share.making');
  const c = await makeCard(r);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  if (SHARE.url) URL.revokeObjectURL(SHARE.url);
  SHARE.blob = blob;
  SHARE.url = URL.createObjectURL(blob);
  $('shareImg').src = SHARE.url;
  $('shareNote').textContent = shareText(r);
  $('shareSendBtn').hidden = !navigator.share;
}

async function copyShareText() {
  const txt = shareText(SHARE.result);
  try { await navigator.clipboard.writeText(txt); toast(t('share.copied')); } catch (e) { toast(t('share.copyFail')); }
}

$('shareBtn').addEventListener('click', openShare);
$('shareCloseBtn').addEventListener('click', () => { Sound.click(); $('shareOverlay').classList.remove('visible'); });
$('shareSaveBtn').addEventListener('click', () => {
  if (!SHARE.url) return;
  const a = document.createElement('a');
  a.href = SHARE.url;
  a.download = 'oz-terminal-result.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  Sound.good();
  track('share', { mode: SHARE.result.mode, n: 0 });
});
$('shareCopyBtn').addEventListener('click', () => { copyShareText(); track('share', { mode: SHARE.result.mode, n: 1 }); });
$('shareSendBtn').addEventListener('click', async () => {
  if (!SHARE.blob) return;
  const text = shareText(SHARE.result);
  const file = new File([SHARE.blob], 'oz-terminal-result.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text });
    else await navigator.share({ text, url: 'https://' + SITE });
    track('share', { mode: SHARE.result.mode, n: 2 });
  } catch (e) {
    if (e && e.name !== 'AbortError') copyShareText();
  }
});

// ═══════════════════════════════════════════════
// АНОНИМНАЯ СТАТИСТИКА (api/event): только счётчики, без личных данных
// ═══════════════════════════════════════════════
function track(e, data = {}) {
  if (!SETTINGS.stats) return;
  const body = JSON.stringify(Object.assign({ e, id: PLAYER.id }, data));
  try {
    if (navigator.sendBeacon && navigator.sendBeacon('api/event', new Blob([body], { type: 'application/json' }))) return;
  } catch (err) {}
  fetch('api/event', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
}

// Vercel Web Analytics (просмотры страниц) — только на сайте, не локально
function loadWebAnalytics() {
  if (!SETTINGS.stats || !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname)) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  const sc = document.createElement('script');
  sc.defer = true;
  sc.src = '/_vercel/insights/script.js';
  document.head.appendChild(sc);
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
window.addEventListener('resize', () => { if (isLock()) resizeCanvas(); MiniGames.resize(); Tutorial.position(); });
applyStaticI18n();
applySettings();
syncSettingsUI();
selectDiff(S.diff);
buildTopics();
buildMods();
updateSoundBtn();
showStartScreen();
runBoot();
requestAnimationFrame(loop);
track('visit');
loadWebAnalytics();
