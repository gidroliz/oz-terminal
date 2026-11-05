'use strict';

// POST /api/run { mode } → { ok, token } — жетон нового взлома с отметкой времени сервера
const crypto = require('crypto');
const redis = require('./_lib/redis');
const { readBody, send, clientIp } = require('./_lib/http');
const { MODES, RUN_TTL, rateLimit } = require('./_lib/rules');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });
  if (!redis.configured()) return send(res, 200, { ok: false, error: 'not_configured' });
  try {
    const { mode } = await readBody(req);
    if (!MODES[mode]) return send(res, 400, { ok: false, error: 'bad_mode' });
    if (!(await rateLimit('run', clientIp(req), 120, 3600))) return send(res, 429, { ok: false, error: 'rate' });
    const token = crypto.randomBytes(16).toString('hex');
    await redis.call('SET', `run:${token}`, JSON.stringify({ mode, t: Date.now() }), 'EX', RUN_TTL);
    return send(res, 200, { ok: true, token });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server' });
  }
};
