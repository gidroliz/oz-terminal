'use strict';

// POST /api/event { e, id, mode?, n? } → { ok } — анонимная статистика: только счётчики.
// st:{день}   — счётчики событий за день (визиты, старты, финиши по режимам, отправки...)
// uv:{день}   — оценка числа уникальных игроков (HyperLogLog по случайному id устройства)
// fn:{режим}  — воронка: сколько раз игроки дошли до этапа n (0 — старт, done — финиш)
const redis = require('./_lib/redis');
const { readBody, send, clientIp } = require('./_lib/http');
const { MODES, validId, rateLimit } = require('./_lib/rules');

const EVENTS = ['visit', 'start', 'stage', 'finish', 'fail', 'share', 'lb', 'quit'];
const KEEP = 200 * 24 * 3600; // дневные счётчики хранятся 200 дней

const day = () => new Date().toISOString().slice(0, 10);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });
  if (!redis.configured()) return send(res, 200, { ok: false, error: 'not_configured' });
  try {
    const b = await readBody(req);
    if (!EVENTS.includes(b.e)) return send(res, 400, { ok: false, error: 'bad_event' });
    const mode = MODES[b.mode] ? b.mode : null;
    const n = Math.floor(Number(b.n));
    if (!(await rateLimit('ev', clientIp(req), 600, 3600))) return send(res, 429, { ok: false, error: 'rate' });

    const st = `st:${day()}`;
    await redis.call('HINCRBY', st, b.e, 1);
    if (mode && b.e !== 'stage') await redis.call('HINCRBY', st, `${b.e}:${mode}`, 1);
    await redis.call('EXPIRE', st, KEEP);
    if (b.e === 'visit' && validId(b.id)) {
      await redis.call('PFADD', `uv:${day()}`, b.id);
      await redis.call('EXPIRE', `uv:${day()}`, KEEP);
    }
    if (mode && b.e === 'start') await redis.call('HINCRBY', `fn:${mode}`, '0', 1);
    if (mode && b.e === 'stage' && n >= 1 && n <= 500) await redis.call('HINCRBY', `fn:${mode}`, String(n), 1);
    if (mode && b.e === 'finish') await redis.call('HINCRBY', `fn:${mode}`, 'done', 1);
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server' });
  }
};
