'use strict';

// Правила таблицы рекордов: режимы, проверка результатов, проверка позывных.
const redis = require('./redis');

const MODES = {
  easy:    { stages: 5, minMs: 12000 },
  normal:  { stages: 8, minMs: 25000 },
  hard:    { stages: 8, minMs: 25000 },
  alarm:   { stages: 8, minMs: 25000 },
  endless: { endless: true, msPerStage: 2500 },
};

// Модификаторы: бонус в процентах к итоговому времени (как в script.js)
const MODS = { noscan: 10, onepick: 15, fragile: 10, noreserve: 10, chaos: 5, blind: 10 };
const MOD_CAP = 40;

// Ключи таблиц. Версия 2 — с сейфами, щитками и картами (этапов стало больше)
const KEY = {
  lb: (mode) => `lb2:${mode}`,
  info: (mode) => `lbinfo2:${mode}`,
  banned: 'banned',
};

const RUN_TTL = 24 * 3600;      // жетон взлома живёт сутки
const CLOCK_SLACK = 5000;       // допуск на расхождение часов и сеть, мс
const TOP = 50;

// Корни грубых слов: позывные с ними не принимаются
const BAD = ['хуй', 'хуе', 'хуё', 'пизд', 'бляд', 'блят', 'ебан', 'ёбан', 'ебат', 'уеб', 'мудак', 'сука', 'суки', 'шлюх', 'пидор', 'пидр',
  'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'whore', 'dick', 'pussy'];

function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 16) return { error: 'name_length' };
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(name)) return { error: 'name_chars' };
  const low = name.toLowerCase().replace(/[^a-zа-яё]/g, '');
  if (BAD.some((b) => low.includes(b))) return { error: 'name_bad' };
  return { name };
}

function validId(id) {
  return typeof id === 'string' && /^[a-z0-9]{16,40}$/.test(id);
}

const int = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : NaN);

// Проверяет заявленный результат относительно режима и реального времени взлома
function checkResult(mode, r, wallMs) {
  const m = MODES[mode];
  if (!m) return 'bad_mode';
  const time = int(r.time);
  const stages = int(r.stages);
  const broken = int(r.broken);
  const stars = int(r.stars);
  if (![time, stages, broken, stars].every(Number.isFinite)) return 'bad_number';
  if (time <= 0 || broken < 0 || broken > 999 || stars < 0) return 'bad_number';
  if (time > wallMs + CLOCK_SLACK) return 'too_fast';
  if (m.endless) {
    if (stages < 1 || stages > 1000) return 'bad_stages';
    if (wallMs + CLOCK_SLACK < stages * m.msPerStage) return 'too_fast';
  } else {
    if (stages !== m.stages) return 'bad_stages';
    if (time < m.minMs) return 'too_fast';
  }
  if (stars > stages * 3) return 'bad_stars';
  return null;
}

// Список модификаторов из запроса: только известные, без повторов. null — если прислано что-то не то
function cleanMods(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > Object.keys(MODS).length) return null;
  const out = [];
  for (const m of raw) {
    if (typeof m !== 'string' || !MODS[m] || out.includes(m)) return null;
    out.push(m);
  }
  return out.sort();
}

const modBonus = (mods) => Math.min(MOD_CAP, mods.reduce((a, m) => a + MODS[m], 0));
const adjTime = (time, mods) => Math.round(Math.floor(Number(time)) * (1 - modBonus(mods) / 100));

// Сортировка: обычные режимы — меньше время лучше; бесконечный — больше этапов, потом меньше время.
// Время берётся с учётом бонуса модификаторов.
function scoreOf(mode, r, mods = []) {
  const time = adjTime(r.time, mods);
  return MODES[mode].endless ? Number(r.stages) * 1e8 - Math.min(time, 99999999) : time;
}

// Ограничение частоты запросов с одного адреса
async function rateLimit(kind, ip, limit, windowSec) {
  const key = `rl:${kind}:${ip}`;
  const n = Number(await redis.call('INCR', key));
  if (n === 1) await redis.call('EXPIRE', key, windowSec);
  return n <= limit;
}

module.exports = { MODES, MODS, KEY, RUN_TTL, TOP, cleanName, validId, checkResult, cleanMods, modBonus, adjTime, scoreOf, rateLimit };
