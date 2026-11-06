'use strict';

// Мини-Redis в памяти: ровно те команды, что использует api/. Только для тестов.
function createFakeRedis() {
  const kv = new Map();      // строки
  const exp = new Map();     // время истечения ключей
  const zsets = new Map();   // key → Map(member → score)
  const hashes = new Map();  // key → Map(field → value)
  const sets = new Map();    // key → Set (и для PFADD/PFCOUNT — точный подсчёт вместо оценки)

  const alive = (k) => { if (exp.has(k) && exp.get(k) < Date.now()) { kv.delete(k); exp.delete(k); } return kv.has(k); };
  const z = (k) => { if (!zsets.has(k)) zsets.set(k, new Map()); return zsets.get(k); };
  const st = (k) => { if (!sets.has(k)) sets.set(k, new Set()); return sets.get(k); };
  const h = (k) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k); };
  const sorted = (k) => [...z(k).entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map((e) => e[0]);
  const slice = (arr, a, b) => { a = Number(a); b = Number(b); if (b < 0) b = arr.length + b; return arr.slice(a, b + 1); };

  return async function call(cmd) {
    const [c, ...a] = cmd;
    switch (c.toUpperCase()) {
      case 'SET': kv.set(a[0], a[1]); if (String(a[2]).toUpperCase() === 'EX') exp.set(a[0], Date.now() + Number(a[3]) * 1000); return 'OK';
      case 'GET': return alive(a[0]) ? kv.get(a[0]) : null;
      case 'DEL': return kv.delete(a[0]) ? 1 : 0;
      case 'INCR': { const v = (alive(a[0]) ? Number(kv.get(a[0])) : 0) + 1; kv.set(a[0], String(v)); return v; }
      case 'EXPIRE': exp.set(a[0], Date.now() + Number(a[1]) * 1000); return 1;
      case 'ZADD': z(a[0]).set(a[2], Number(a[1])); return 1;
      case 'ZSCORE': { const v = z(a[0]).get(a[1]); return v == null ? null : String(v); }
      case 'ZRANGE': return slice(sorted(a[0]), a[1], a[2]);
      case 'ZREVRANGE': return slice(sorted(a[0]).reverse(), a[1], a[2]);
      case 'ZRANK': { const i = sorted(a[0]).indexOf(a[1]); return i < 0 ? null : i; }
      case 'ZREVRANK': { const i = sorted(a[0]).reverse().indexOf(a[1]); return i < 0 ? null : i; }
      case 'ZCARD': return z(a[0]).size;
      case 'ZREM': return z(a[0]).delete(a[1]) ? 1 : 0;
      case 'HSET': h(a[0]).set(a[1], a[2]); return 1;
      case 'HGET': { const v = h(a[0]).get(a[1]); return v == null ? null : v; }
      case 'HMGET': return a.slice(1).map((f) => { const v = h(a[0]).get(f); return v == null ? null : v; });
      case 'PING': return 'PONG';
      case 'HLEN': return h(a[0]).size;
      case 'HDEL': return h(a[0]).delete(a[1]) ? 1 : 0;
      case 'HINCRBY': { const v = (Number(h(a[0]).get(a[1])) || 0) + Number(a[2]); h(a[0]).set(a[1], String(v)); return v; }
      case 'HGETALL': return [...h(a[0]).entries()].flat();
      case 'SADD': case 'PFADD': { const s = st(a[0]); const n = s.size; a.slice(1).forEach((x) => s.add(x)); return s.size - n; }
      case 'SREM': return st(a[0]).delete(a[1]) ? 1 : 0;
      case 'SISMEMBER': return st(a[0]).has(a[1]) ? 1 : 0;
      case 'SMEMBERS': return [...st(a[0])];
      case 'PFCOUNT': return st(a[0]).size;
      default: throw new Error('fake redis: unsupported ' + c);
    }
  };
}

module.exports = { createFakeRedis };
