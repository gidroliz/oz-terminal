'use strict';

// POST /api/score { token, id, name, mode, time, stages, broken, stars } → { ok, rank, total, best }
const redis = require('./_lib/redis');
const { readBody, send, clientIp } = require('./_lib/http');
const { MODES, cleanName, validId, checkResult, scoreOf, rateLimit } = require('./_lib/rules');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });
  if (!redis.configured()) return send(res, 200, { ok: false, error: 'not_configured' });
  try {
    const b = await readBody(req);
    if (!validId(b.id)) return send(res, 400, { ok: false, error: 'bad_id' });
    const nm = cleanName(b.name);
    if (nm.error) return send(res, 400, { ok: false, error: nm.error });
    if (!MODES[b.mode]) return send(res, 400, { ok: false, error: 'bad_mode' });
    if (!(await rateLimit('score', clientIp(req), 30, 3600))) return send(res, 429, { ok: false, error: 'rate' });

    const raw = await redis.call('GET', `run:${String(b.token || '').replace(/[^a-f0-9]/g, '')}`);
    if (!raw) return send(res, 400, { ok: false, error: 'bad_token' });
    const run = JSON.parse(raw);
    if (run.mode !== b.mode) return send(res, 400, { ok: false, error: 'bad_token' });
    const problem = checkResult(b.mode, b, Date.now() - run.t);
    if (problem) return send(res, 400, { ok: false, error: problem });
    await redis.call('DEL', `run:${b.token}`); // жетон одноразовый

    const endless = !!MODES[b.mode].endless;
    const key = `lb:${b.mode}`;
    const score = scoreOf(b.mode, b);
    const prev = await redis.call('ZSCORE', key, b.id);
    const improved = prev == null || (endless ? score > Number(prev) : score < Number(prev));
    await redis.call('HSET', 'players', b.id, nm.name);
    if (improved) {
      await redis.call('ZADD', key, score, b.id);
      await redis.call('HSET', `lbinfo:${b.mode}`, b.id, JSON.stringify({
        time: Math.floor(b.time), stages: Math.floor(b.stages), broken: Math.floor(b.broken), stars: Math.floor(b.stars), d: Date.now(),
      }));
    }
    const rank = Number(await redis.call(endless ? 'ZREVRANK' : 'ZRANK', key, b.id)) + 1;
    const total = Number(await redis.call('ZCARD', key));
    return send(res, 200, { ok: true, rank, total, best: improved });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server' });
  }
};
