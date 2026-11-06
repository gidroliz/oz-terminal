'use strict';

// Проверка серверной части таблицы рекордов на поддельной базе в памяти.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let server;
let base;

test.before(async () => { ({ server, url: base } = await startServer()); });
test.after(() => server.close());

const post = async (path, body) => (await fetch(base + 'api/' + path, { method: 'POST', body: JSON.stringify(body) })).json();
const get = async (path) => (await fetch(base + 'api/' + path)).json();
const id = (n) => ('player' + n).padEnd(20, '0');

// Жетон «как будто взлом начался ago мс назад»: подкручиваем время в базе через повторный SET
async function runStartedAgo(mode, ago) {
  const r = await post('run', { mode });
  assert.ok(r.ok);
  const redis = require('../api/_lib/redis');
  await redis.call('SET', `run:${r.token}`, JSON.stringify({ mode, t: Date.now() - ago }), 'EX', 3600);
  return r.token;
}

test('результат записывается, лучший сохраняется, таблица сортируется', async () => {
  let t = await runStartedAgo('normal', 120000);
  let r = await post('score', { token: t, id: id(1), name: 'Альфа', mode: 'normal', time: 100000, stages: 5, broken: 1, stars: 12 });
  assert.deepEqual([r.ok, r.rank, r.total, r.best], [true, 1, 1, true]);

  t = await runStartedAgo('normal', 120000);
  r = await post('score', { token: t, id: id(2), name: 'Bravo', mode: 'normal', time: 60000, stages: 5, broken: 0, stars: 15 });
  assert.deepEqual([r.rank, r.total], [1, 2]);

  // Худший результат не перезаписывает лучший
  t = await runStartedAgo('normal', 120000);
  r = await post('score', { token: t, id: id(2), name: 'Bravo', mode: 'normal', time: 90000, stages: 5, broken: 0, stars: 15 });
  assert.equal(r.best, false);

  const lb = await get('leaderboard?mode=normal&id=' + id(1));
  assert.deepEqual(lb.top.map((x) => [x.rank, x.name, x.time]), [[1, 'Bravo', 60000], [2, 'Альфа', 100000]]);
  assert.equal(lb.me.rank, 2);
  assert.ok(lb.top[1].me);
  assert.ok(!('id' in lb.top[0]), 'id игроков не должны утекать');
});

test('бесконечный режим: больше этапов — выше', async () => {
  let t = await runStartedAgo('endless', 200000);
  await post('score', { token: t, id: id(3), name: 'Gamma', mode: 'endless', time: 150000, stages: 12, broken: 3, stars: 20 });
  t = await runStartedAgo('endless', 200000);
  await post('score', { token: t, id: id(4), name: 'Delta', mode: 'endless', time: 100000, stages: 8, broken: 2, stars: 18 });
  const lb = await get('leaderboard?mode=endless');
  assert.deepEqual(lb.top.map((x) => x.name), ['Gamma', 'Delta']);
});

test('накрутка отклоняется', async () => {
  // Заявлено время больше, чем реально прошло с начала взлома
  let t = await runStartedAgo('normal', 20000);
  let r = await post('score', { token: t, id: id(5), name: 'Cheat', mode: 'normal', time: 3000, stages: 5, broken: 0, stars: 15 });
  assert.equal(r.error, 'too_fast');
  // Неверное число этапов
  t = await runStartedAgo('normal', 120000);
  r = await post('score', { token: t, id: id(5), name: 'Cheat', mode: 'normal', time: 60000, stages: 3, broken: 0, stars: 9 });
  assert.equal(r.error, 'bad_stages');
  // Чужой режим у жетона
  t = await runStartedAgo('easy', 120000);
  r = await post('score', { token: t, id: id(5), name: 'Cheat', mode: 'normal', time: 60000, stages: 5, broken: 0, stars: 15 });
  assert.equal(r.error, 'bad_token');
  // Повторное использование жетона
  t = await runStartedAgo('easy', 120000);
  r = await post('score', { token: t, id: id(5), name: 'Fair', mode: 'easy', time: 60000, stages: 3, broken: 0, stars: 9 });
  assert.ok(r.ok);
  r = await post('score', { token: t, id: id(5), name: 'Fair', mode: 'easy', time: 30000, stages: 3, broken: 0, stars: 9 });
  assert.equal(r.error, 'bad_token');
  // Бесконечный: этапов больше, чем физически можно пройти
  t = await runStartedAgo('endless', 10000);
  r = await post('score', { token: t, id: id(5), name: 'Fair', mode: 'endless', time: 9000, stages: 50, broken: 0, stars: 150 });
  assert.equal(r.error, 'too_fast');
});

test('позывные проверяются', async () => {
  const t = await runStartedAgo('easy', 120000);
  for (const [name, err] of [['A', 'name_length'], ['<script>', 'name_chars'], ['x'.repeat(17), 'name_length'], ['Сукин сын', 'name_bad']]) {
    const r = await post('score', { token: t, id: id(6), name, mode: 'easy', time: 60000, stages: 3, broken: 0, stars: 9 });
    assert.equal(r.error, err, name);
  }
});

test('смена позывного', async () => {
  let r = await post('name', { id: id(1), name: 'Альфа-2' });
  assert.ok(r.ok);
  const lb = await get('leaderboard?mode=normal');
  assert.ok(lb.top.some((x) => x.name === 'Альфа-2'));
});

test('проверка подключения базы', async () => {
  const r = await get('health');
  assert.deepEqual([r.ok, r.storage], [true, 'connected']);
  assert.ok(r.players >= 1);
});
