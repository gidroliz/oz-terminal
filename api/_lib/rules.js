'use strict';

// Правила таблицы рекордов: режимы, проверка результатов, проверка позывных.
const redis = require('./redis');

const MODES = {
  easy:    { stages: 3, minMs: 8000 },
  normal:  { stages: 5, minMs: 15000 },
  hard:    { stages: 5, minMs: 15000 },
  alarm:   { stages: 5, minMs: 15000 },
  endless: { endless: true, msPerStage: 2500 },
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

// Сортировка: обычные режимы — меньше время лучше; бесконечный — больше этапов, потом меньше время
function scoreOf(mode, r) {
  return MODES[mode].endless ? Number(r.stages) * 1e8 - Math.min(Number(r.time), 99999999) : Number(r.time);
}

// Ограничение частоты запросов с одного адреса
async function rateLimit(kind, ip, limit, windowSec) {
  const key = `rl:${kind}:${ip}`;
  const n = Number(await redis.call('INCR', key));
  if (n === 1) await redis.call('EXPIRE', key, windowSec);
  return n <= limit;
}

module.exports = { MODES, RUN_TTL, TOP, cleanName, validId, checkResult, scoreOf, rateLimit };
