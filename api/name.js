'use strict';

// POST /api/name { id, name } → { ok } — смена позывного уже записанного игрока
const redis = require('./_lib/redis');
const { readBody, send, clientIp } = require('./_lib/http');
const { cleanName, validId, rateLimit } = require('./_lib/rules');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });
  if (!redis.configured()) return send(res, 200, { ok: false, error: 'not_configured' });
  try {
    const b = await readBody(req);
    if (!validId(b.id)) return send(res, 400, { ok: false, error: 'bad_id' });
    const nm = cleanName(b.name);
    if (nm.error) return send(res, 400, { ok: false, error: nm.error });
    if (!(await rateLimit('name', clientIp(req), 20, 3600))) return send(res, 429, { ok: false, error: 'rate' });
    const exists = await redis.call('HGET', 'players', b.id);
    if (exists != null) await redis.call('HSET', 'players', b.id, nm.name);
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server' });
  }
};
