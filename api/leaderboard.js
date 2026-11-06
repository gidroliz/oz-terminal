'use strict';

// GET /api/leaderboard?mode=normal&id=... → { ok, top: [...], me }
const redis = require('./_lib/redis');
const { query, send } = require('./_lib/http');
const { MODES, KEY, TOP, validId } = require('./_lib/rules');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method' });
  if (!redis.configured()) return send(res, 200, { ok: false, error: 'not_configured' });
  try {
    const q = query(req);
    const mode = q.mode;
    if (!MODES[mode]) return send(res, 400, { ok: false, error: 'bad_mode' });
    const endless = !!MODES[mode].endless;
    const key = KEY.lb(mode);
    const ids = (await redis.call(endless ? 'ZREVRANGE' : 'ZRANGE', key, 0, TOP - 1)) || [];
    const me = validId(q.id) ? q.id : null;
    const all = me && !ids.includes(me) ? [...ids, me] : ids;
    let names = [];
    let infos = [];
    if (all.length) {
      names = await redis.call('HMGET', 'players', ...all);
      infos = await redis.call('HMGET', KEY.info(mode), ...all);
    }
    const row = (i, rank) => {
      const info = infos[i] ? JSON.parse(infos[i]) : {};
      return {
        rank, name: names[i] || '???', time: info.time, stages: info.stages, broken: info.broken, stars: info.stars,
        mods: info.mods || [], d: info.d, me: all[i] === me,
      };
    };
    const top = ids.map((id, i) => row(i, i + 1));
    let mine = null;
    if (me) {
      const idx = ids.indexOf(me);
      if (idx >= 0) mine = top[idx];
      else if (infos[all.length - 1]) {
        const r = await redis.call(endless ? 'ZREVRANK' : 'ZRANK', key, me);
        if (r != null) mine = row(all.length - 1, Number(r) + 1);
      }
    }
    const total = Number(await redis.call('ZCARD', key));
    return send(res, 200, { ok: true, mode, total, top, me: mine });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server' });
  }
};
