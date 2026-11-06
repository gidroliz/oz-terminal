'use strict';

// Модерация и статистика. Требует переменную окружения ADMIN_TOKEN и заголовок Authorization: Bearer <ADMIN_TOKEN>.
// Страница для этого — /admin.html.
// GET  /api/admin?mode=normal                → полный список таблицы режима с id игроков
// GET  /api/admin?stats=30                   → статистика за последние N дней, воронки, баны
// POST /api/admin { action: 'remove', mode, id }  → удалить результат игрока из таблицы режима
// POST /api/admin { action: 'rename', id, name }  → принудительно сменить позывной
// POST /api/admin { action: 'ban', id }           → убрать игрока из всех таблиц и не принимать его результаты
// POST /api/admin { action: 'unban', id }         → снять бан
const crypto = require('crypto');
const redis = require('./_lib/redis');
const { readBody, query, send } = require('./_lib/http');
const { MODES, KEY, validId } = require('./_lib/rules');

function authorized(req) {
  const secret = process.env.ADMIN_TOKEN;
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !got || got.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

// HGETALL отдаёт плоский список [поле, значение, ...]
function toObj(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = Number(flat[i + 1]) || 0;
  else if (flat && typeof flat === 'object') for (const k of Object.keys(flat)) o[k] = Number(flat[k]) || 0;
  return o;
}

async function stats(days) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const c = toObj(await redis.call('HGETALL', `st:${d}`));
    c.uv = Number(await redis.call('PFCOUNT', `uv:${d}`)) || 0;
    out.push({ d, c });
  }
  const funnel = {};
  const boards = {};
  for (const m of Object.keys(MODES)) {
    funnel[m] = toObj(await redis.call('HGETALL', `fn:${m}`));
    boards[m] = Number(await redis.call('ZCARD', KEY.lb(m))) || 0;
  }
  const players = Number(await redis.call('HLEN', 'players')) || 0;
  const bannedIds = (await redis.call('SMEMBERS', KEY.banned)) || [];
  const bannedNames = bannedIds.length ? await redis.call('HMGET', 'players', ...bannedIds) : [];
  return { days: out, funnel, boards, players, banned: bannedIds.map((id, i) => ({ id, name: bannedNames[i] })) };
}

module.exports = async function handler(req, res) {
  if (!authorized(req)) return send(res, 403, { ok: false, error: 'forbidden' });
  if (!redis.configured()) return send(res, 200, { ok: false, error: 'not_configured' });
  try {
    if (req.method === 'GET') {
      const q = query(req);
      if (q.stats) return send(res, 200, Object.assign({ ok: true }, await stats(Math.max(1, Math.min(90, Math.floor(Number(q.stats)) || 30)))));
      const mode = q.mode;
      if (!MODES[mode]) return send(res, 400, { ok: false, error: 'bad_mode' });
      const ids = (await redis.call(MODES[mode].endless ? 'ZREVRANGE' : 'ZRANGE', KEY.lb(mode), 0, -1)) || [];
      const names = ids.length ? await redis.call('HMGET', 'players', ...ids) : [];
      const infos = ids.length ? await redis.call('HMGET', KEY.info(mode), ...ids) : [];
      return send(res, 200, {
        ok: true,
        rows: ids.map((id, i) => Object.assign({ rank: i + 1, id, name: names[i] }, infos[i] ? JSON.parse(infos[i]) : {})),
      });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!validId(b.id)) return send(res, 400, { ok: false, error: 'bad_id' });
      if (b.action === 'remove' && MODES[b.mode]) {
        await redis.call('ZREM', KEY.lb(b.mode), b.id);
        await redis.call('HDEL', KEY.info(b.mode), b.id);
        return send(res, 200, { ok: true });
      }
      if (b.action === 'rename' && b.name) {
        await redis.call('HSET', 'players', b.id, String(b.name).replace(/\s+/g, ' ').trim().slice(0, 16));
        return send(res, 200, { ok: true });
      }
      if (b.action === 'ban') {
        await redis.call('SADD', KEY.banned, b.id);
        for (const m of Object.keys(MODES)) {
          await redis.call('ZREM', KEY.lb(m), b.id);
          await redis.call('HDEL', KEY.info(m), b.id);
        }
        return send(res, 200, { ok: true });
      }
      if (b.action === 'unban') {
        await redis.call('SREM', KEY.banned, b.id);
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { ok: false, error: 'bad_action' });
    }
    return send(res, 405, { ok: false, error: 'method' });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server' });
  }
};
