'use strict';

// GET /api/health → проверка подключения базы таблицы рекордов (значения переменных не раскрываются).
// storage: "connected" — база отвечает;
//          "not_configured" — переменные базы не найдены (подключи базу к проекту и сделай Redeploy);
//          "error" — переменные есть, но база не отвечает.
const redis = require('./_lib/redis');
const { send } = require('./_lib/http');

// Какой деплой ответил: окружение Vercel и коммит
function deployment() {
  return {
    env: process.env.VERCEL_ENV || 'local',
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
  };
}

module.exports = async function handler(req, res) {
  const how = redis.describe();
  if (!how) return send(res, 200, { ok: false, storage: 'not_configured', envHints: redis.envHints(), deployment: deployment() });
  try {
    const pong = await redis.call('PING');
    const players = Number(await redis.call('HLEN', 'players')) || 0;
    return send(res, 200, { ok: pong === 'PONG', storage: 'connected', via: how.kind, vars: how.vars, players, deployment: deployment() });
  } catch (e) {
    return send(res, 200, { ok: false, storage: 'error', via: how.kind, vars: how.vars, message: String(e.message || e).slice(0, 160), deployment: deployment() });
  }
};
