'use strict';

// Браузерные сценарии: игра запускается в Chromium через Playwright.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers');

let server;
let url;
let browser;

test.before(async () => {
  ({ server, url } = await startServer());
  browser = await chromium.launch();
});

test.after(async () => {
  await browser.close();
  server.close();
});

// Новая вкладка с чистым хранилищем. По умолчанию обучение выключено и язык русский.
async function openGame({ settings = { lang: 'ru' }, tutorial = false, viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ settings, tutorial }) => {
    if (sessionStorage.getItem('oz.test.init')) return;
    sessionStorage.setItem('oz.test.init', '1');
    localStorage.clear();
    localStorage.setItem('oz.settings', JSON.stringify(settings));
    if (!tutorial) localStorage.setItem('oz.tutorial', 'done');
  }, { settings, tutorial });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => typeof S !== 'undefined' && S.stages.length > 0);
  return { page, context, problems };
}

async function startMode(page, mode) {
  await page.click(`.diff-btn[data-diff="${mode}"]`);
  await page.click('#startBtn');
  await page.waitForFunction(() => S.started);
  // Плавающая точка и случайные события мешают автоматическому прохождению
  await page.evaluate(() => { CFG.FLOAT_AMP = 0; CFG.EVENTS = false; S.eventAt = 0; });
}

// Мини-игры «идеально»: сейф — диск ровно на числе, щиток — один поворот до решения, карта — нажатие в центре блока
async function solveMiniGame(page) {
  const type = await page.evaluate(() => S.mg.type);
  if (type === 'safe') {
    const n = await page.evaluate(() => S.mg.combo.length);
    for (let i = 0; i < n; i++) {
      await page.evaluate(() => { S.mg.pos = S.mg.combo[S.mg.idx]; });
      await page.click('.mg-act');
    }
  } else if (type === 'wire') {
    const i = await page.evaluate(() => {
      const path = S.mg.tiles.map((tl, k) => [tl, k]).filter(([tl]) => tl.path);
      path.forEach(([tl]) => { tl.r = 0; });
      const [last, k] = path[path.length - 1];
      last.r = 3; // ещё один поворот по часовой — и цепь замкнётся
      return k;
    });
    await page.click(`.wt[data-i="${i}"]`);
  } else {
    const n = await page.evaluate(() => S.mg.need);
    for (let i = 0; i < n; i++) await page.evaluate(() => { S.mg.beam = (S.mg.zone[0] + S.mg.zone[1]) / 2; MiniGames.act(); });
  }
}

// Проходит текущий этап «идеально»: замок — отмычкой точно в цель, терминал — сразу паролем
async function solveStage(page) {
  const before = await page.evaluate(() => S.cleared);
  for (let guard = 0; guard < 6; guard++) {
    const type = await page.evaluate(() => S.stages[S.stage].type);
    if (type === 'lock') {
      const pins = await page.evaluate(() => { S.angle = S.target; return S.pinsLeft; });
      await page.dispatchEvent('#hackBtn', 'pointerdown');
      // Ждём, пока замок откроется или поддастся штифт двойного замка
      await page.waitForFunction(([b, p]) => S.cleared > b || S.pinsLeft < p || S.finished, [before, pins], { timeout: 5000 });
      await page.dispatchEvent('#hackBtn', 'pointerup');
    } else if (type === 'term') {
      const start = await page.evaluate(() => S.term.words.find((w) => w.w === S.term.password).start);
      await page.click(`[data-i="${start}"]`);
    } else {
      await solveMiniGame(page);
    }
    if (await page.evaluate((b) => S.cleared > b, before)) break;
    await page.waitForFunction(() => S.rot <= 0, null, { timeout: 3000 });
  }
  await page.waitForFunction(() => !S.advancing || S.finished || document.getElementById('upgradeOverlay').classList.contains('visible'), null, { timeout: 5000 });
}

test('игра загружается без ошибок на обоих языках', async () => {
  for (const lang of ['ru', 'en']) {
    const { page, context, problems } = await openGame({ settings: { lang } });
    const title = await page.textContent('#startBtn');
    assert.match(title, lang === 'ru' ? /НОВЫЙ ВЗЛОМ/ : /NEW BREACH/);
    await page.click('#startBtn');
    await page.waitForTimeout(200);
    assert.deepEqual(problems, []);
    await context.close();
  }
});

test('режим «Взломщик» проходится целиком, все звёзды и записи журнала', async () => {
  const { page, context, problems } = await openGame();
  await startMode(page, 'normal');
  const total = await page.evaluate(() => S.stages.length);
  for (let i = 0; i < total; i++) await solveStage(page);
  await page.waitForFunction(() => S.finished);
  assert.equal(await page.textContent('#endTitle'), 'ДОСТУП РАЗРЕШЁН');
  const res = await page.evaluate(() => ({ cleared: S.cleared, stars: S.stars.map((s) => s.filter(Boolean).length), lore: P.lore }));
  assert.equal(res.cleared, total);
  assert.deepEqual(res.stars, Array(total).fill(3));
  assert.equal(res.lore, total);
  assert.ok(await page.evaluate(() => P.ach.perfect && P.ach.first));
  assert.deepEqual(problems, []);
  await context.close();
});

test('двойной замок требует два штифта', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'normal');
  await page.evaluate(() => { S.stage = 7; enterStage(true); });
  assert.equal(await page.evaluate(() => S.pinsLeft), 2);
  await page.evaluate(() => { S.angle = S.target; });
  await page.dispatchEvent('#hackBtn', 'pointerdown');
  await page.waitForFunction(() => S.pinsLeft === 1, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => S.cleared), 0);
  await context.close();
});

test('прогресс сохраняется после перезагрузки страницы', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'normal');
  await solveStage(page);
  const wrong = await page.evaluate(() => S.term.words.find((w) => w.w !== S.term.password).start);
  await page.click(`[data-i="${wrong}"]`);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('#continueBtn:not([hidden])');
  await page.click('#continueBtn');
  const st = await page.evaluate(() => ({ stage: S.stage, attempts: S.term.attempts, cleared: S.cleared }));
  assert.deepEqual(st, { stage: 1, attempts: 3, cleared: 1 });
  await context.close();
});

test('пометка слова правым кликом', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'normal');
  await solveStage(page);
  const w = await page.evaluate(() => S.term.words.find((x) => x.w !== S.term.password));
  await page.click(`[data-i="${w.start}"]`, { button: 'right' });
  assert.deepEqual(await page.evaluate(() => S.term.marked), [w.w]);
  assert.ok(await page.$eval(`[data-i="${w.start}"]`, (el) => el.classList.contains('mk')));
  await context.close();
});

test('перемешивающийся терминал раскладывает слова заново после ошибки', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'normal');
  await page.evaluate(() => { S.stage = 5; enterStage(true); });
  assert.equal(await page.evaluate(() => S.term.kind), 'shuffle');
  const before = await page.evaluate(() => S.term.words.map((w) => w.start).join());
  const wrong = await page.evaluate(() => S.term.words.find((w) => w.w !== S.term.password).start);
  await page.click(`[data-i="${wrong}"]`);
  const after = await page.evaluate(() => S.term.words.map((w) => w.start).join());
  assert.notEqual(after, before);
  await context.close();
});

test('бесконечный режим предлагает улучшение после 5 этапов', async () => {
  const { page, context, problems } = await openGame();
  await startMode(page, 'endless');
  for (let i = 0; i < 5; i++) await solveStage(page);
  await page.waitForSelector('#upgradeOverlay.visible');
  assert.equal(await page.$$eval('.upgrade-btn', (b) => b.length), 3);
  await page.keyboard.press('1');
  await page.waitForFunction(() => S.stage === 5 && !S.modalOpen);
  assert.equal(await page.evaluate(() => Object.values(S.ups).reduce((a, b) => a + b, 0)), 1);
  assert.deepEqual(problems, []);
  await context.close();
});

test('«Тревога»: время вышло — провал', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'alarm');
  await page.evaluate(() => { S.timeLeft = 300; });
  await page.waitForFunction(() => S.finished, null, { timeout: 5000 });
  assert.equal(await page.textContent('#endTitle'), 'ДОСТУП ЗАПРЕЩЁН');
  await context.close();
});

test('английская версия: интерфейс и пароли на английском', async () => {
  const { page, context, problems } = await openGame({ settings: { lang: 'en' } });
  await startMode(page, 'normal');
  assert.equal(await page.textContent('.tab[data-tab="hack"]'), 'BREACH');
  await solveStage(page);
  const pw = await page.evaluate(() => S.term.password);
  assert.match(pw, /^[A-Z]+$/);
  await page.click('#getPinBtn');
  assert.match(await page.textContent('#modalTitle'), /IDENTITY CHECK/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('переключение языка на лету', async () => {
  const { page, context, problems } = await openGame();
  await page.click('.lang-btn[data-lang="en"]');
  assert.match(await page.textContent('#startBtn'), /NEW BREACH/);
  await page.click('.lang-btn[data-lang="ru"]');
  assert.match(await page.textContent('#startBtn'), /НОВЫЙ ВЗЛОМ/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('обучение показывает подсказки по шагам', async () => {
  const { page, context } = await openGame({ tutorial: true });
  await startMode(page, 'normal');
  assert.equal(await page.evaluate(() => Tutorial.step), 'drag');
  await page.evaluate(() => setAngle(S.angle + 20));
  assert.equal(await page.evaluate(() => Tutorial.step), 'turn');
  await context.close();
});

test('терминал-ловушка: скобка-ловушка отнимает попытку', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'hard');
  await page.evaluate(() => { S.stage = 1; enterStage(true); });
  assert.equal(await page.evaluate(() => S.term.kind), 'trap');
  // Находим скобочную пару наведением мыши: в строке ввода появится «(...)»
  const idx = await page.evaluate(() => {
    for (const s of document.querySelectorAll('.term-cells span')) {
      s.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
      const typed = document.querySelector('.term-typed').textContent;
      if (typed.length > 1 && '([{<'.includes(typed[0])) return s.dataset.i;
    }
    return null;
  });
  assert.ok(idx, 'в дампе нет скобочной пары');
  await page.evaluate(() => { Math.random = () => 0; }); // ловушка срабатывает гарантированно
  await page.click(`[data-i="${idx}"]`);
  const st = await page.evaluate(() => ({ attempts: S.term.attempts, traps: S.term.trapsHit }));
  assert.deepEqual(st, { attempts: 3, traps: 1 });
  await context.close();
});

// ── Таблица рекордов (сервер api/ работает на поддельной базе в памяти) ──
const redis = require('../api/_lib/redis');

// Сдвигает начало взлома в прошлое, чтобы быстрое автопрохождение выглядело честным для сервера
async function backdateRun(page, ms) {
  await page.waitForFunction(() => !!S.runToken, null, { timeout: 5000 });
  const token = await page.evaluate(() => S.runToken);
  const raw = JSON.parse(await redis.call('GET', `run:${token}`));
  raw.t -= ms;
  await redis.call('SET', `run:${token}`, JSON.stringify(raw), 'EX', 3600);
}

test('таблица рекордов: результат отправляется после ввода позывного', async () => {
  const { page, context, problems } = await openGame();
  await startMode(page, 'easy');
  await backdateRun(page, 60000);
  await page.evaluate(() => { S.elapsed += 20000; }); // время взлома должно быть правдоподобным
  const total = await page.evaluate(() => S.stages.length);
  for (let i = 0; i < total; i++) await solveStage(page);
  await page.waitForSelector('#endNameInput');
  await page.fill('#endNameInput', 'Тестер');
  await page.click('#endNameForm button');
  await page.waitForSelector('.lb-place');
  assert.match(await page.textContent('.lb-place'), /#1/);
  await page.click('#endLbOpen');
  await page.waitForSelector('.lb-row.me');
  assert.match(await page.textContent('.lb-row.me'), /Тестер/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('oz.player')).name), 'Тестер');
  assert.deepEqual(problems, []);
  await context.close();
});

test('таблица рекордов: накрученный результат не принимается', async () => {
  const { page, context } = await openGame();
  await page.evaluate(() => { PLAYER.name = 'Читер'; savePlayer(); });
  await startMode(page, 'easy');
  await page.waitForFunction(() => !!S.runToken);
  await page.evaluate(() => { S.elapsed += 600000; }); // заявленное время больше реально прошедшего
  const total = await page.evaluate(() => S.stages.length);
  for (let i = 0; i < total; i++) await solveStage(page);
  await page.waitForFunction(() => /не приняла/.test(document.getElementById('lbBox').textContent));
  await context.close();
});

test('без сервера игра работает и честно сообщает о недоступности таблицы', async () => {
  const { server: bare, url: bareUrl } = await startServer({ api: false });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => { localStorage.setItem('oz.tutorial', 'done'); localStorage.setItem('oz.settings', '{"lang":"ru"}'); });
  const problems = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto(bareUrl);
    await page.click('#lbLinkBtn');
    await page.waitForFunction(() => /недоступна|не подключена/.test(document.getElementById('lbList').textContent), null, { timeout: 8000 });
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
    bare.close();
  }
});

// ── Мини-игры, события, модификаторы, внешний вид, карточка, админка ──
test('сейф: неверные числа поднимают шум и блокируют сейф, потом сброс', async () => {
  const { page, context, problems } = await openGame();
  await startMode(page, 'normal');
  await page.evaluate(() => { S.stage = 2; enterStage(true); Tutorial.hide(); });
  assert.equal(await page.evaluate(() => S.mg.type), 'safe');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { S.mg.pos = (S.mg.combo[S.mg.idx] + 20) % 40; });
    await page.click('.mg-act');
  }
  assert.ok(await page.evaluate(() => S.termLockLeft > 0 && S.st.lockouts === 1));
  assert.ok(await page.$eval('#mgView .term-lock', (el) => !el.classList.contains('hidden')));
  await page.evaluate(() => { S.termLockLeft = 50; });
  await page.waitForFunction(() => S.termLockLeft <= 0 && S.mg.errors === 0 && S.mg.noise === 0);
  assert.deepEqual(problems, []);
  await context.close();
});

test('щиток: поворот участка и сканер, который чинит схему', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'normal');
  await page.evaluate(() => { S.stage = 4; enterStage(true); Tutorial.hide(); });
  assert.equal(await page.evaluate(() => S.mg.type), 'wire');
  const r0 = await page.evaluate(() => S.mg.tiles[0].r);
  await page.click('.wt[data-i="0"]');
  assert.deepEqual(await page.evaluate(() => [S.mg.moves, S.mg.tiles[0].r]), [1, (r0 + 1) % 4]);
  await page.evaluate(() => { S.scanners = 1; updateButtons(); });
  if (await page.evaluate(() => MiniGames.canScan())) {
    await page.click('#scanBtn');
    assert.equal(await page.evaluate(() => S.mg.tiles.filter((tl) => tl.fixed).length), 1);
    assert.equal(await page.evaluate(() => S.scanners), 0);
  }
  await context.close();
});

test('ключ-карта: промах считается сбоем, попадание записывает блок', async () => {
  const { page, context } = await openGame();
  await startMode(page, 'normal');
  await page.evaluate(() => { S.stage = 6; enterStage(true); Tutorial.hide(); });
  assert.equal(await page.evaluate(() => S.mg.type), 'card');
  await page.evaluate(() => { const [a, b] = S.mg.zone; S.mg.beam = a > 10 ? 0 : 30; MiniGames.act(); });
  assert.deepEqual(await page.evaluate(() => [S.mg.errors, S.mg.got]), [1, 0]);
  await page.evaluate(() => { S.mg.beam = (S.mg.zone[0] + S.mg.zone[1]) / 2; MiniGames.act(); });
  assert.deepEqual(await page.evaluate(() => [S.mg.errors, S.mg.got]), [1, 1]);
  await context.close();
});

test('модификаторы: одна отмычка и без сканера, резерв отключён', async () => {
  const { page, context, problems } = await openGame();
  await page.click('.mod-btn[data-mod="onepick"]');
  await page.click('.mod-btn[data-mod="noscan"]');
  assert.match(await page.textContent('#modsDesc'), /−25%/);
  await startMode(page, 'normal');
  const st = await page.evaluate(() => ({ picks: S.picks, scans: S.scanners, mods: S.mods.slice().sort(), res: document.getElementById('getPinBtn').disabled }));
  assert.deepEqual(st, { picks: 1, scans: 0, mods: ['noscan', 'onepick'], res: true });
  assert.equal(await page.evaluate(() => adjTime(100000, S.mods)), 75000);
  assert.deepEqual(problems, []);
  await context.close();
});

test('события: патруль замечает движение, свет гаснет и возвращается', async () => {
  const { page, context, problems } = await openGame();
  await startMode(page, 'normal');
  await solveStage(page);
  await page.evaluate(() => { startEvent('patrol'); S.event.left = EVENT_DUR.patrol - PATROL_GRACE - 100; });
  await page.waitForFunction(() => S.event && S.event.watch);
  assert.match(await page.textContent('#eventBar'), /ПАТРУЛЬ/);
  await page.click('#termView .term-dump');
  assert.deepEqual(await page.evaluate(() => [S.event, S.scanners]), [null, 0]);
  await page.evaluate(() => startEvent('blackout'));
  assert.ok(await page.evaluate(() => hackPane.classList.contains('ev-blackout')));
  await page.evaluate(() => { S.event.left = 100; });
  await page.waitForFunction(() => !hackPane.classList.contains('ev-blackout') && !S.event);
  assert.deepEqual(problems, []);
  await context.close();
});

test('внешний вид: закрытая тема не включается, после достижения — включается', async () => {
  const { page, context } = await openGame();
  await page.click('#statsLinkBtn');
  await page.click('.tab[data-tab="cfg"]');
  await page.click('.theme-btn[data-theme="red"]');
  assert.equal(await page.evaluate(() => SETTINGS.theme), 'green');
  assert.ok((await page.textContent('#toast')).includes(await page.evaluate(() => t('ach.alarm.name'))));
  await page.evaluate(() => { P.ach.alarm = Date.now(); P.ach.first = Date.now(); buildCosmetics(); });
  await page.click('.theme-btn[data-theme="red"]');
  await page.click('.skin-btn[data-skin="brass"]');
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.theme, SETTINGS.pick]), ['red', 'brass']);
  await context.close();
});

test('карточка результата: картинка 1080×1350 и текст с режимом', async () => {
  const { page, context, problems } = await openGame();
  await startMode(page, 'easy');
  const total = await page.evaluate(() => S.stages.length);
  for (let i = 0; i < total; i++) await solveStage(page);
  await page.waitForSelector('#shareBtn:not([hidden])');
  await page.click('#shareBtn');
  await page.waitForFunction(() => document.getElementById('shareImg').naturalWidth > 0, null, { timeout: 8000 });
  assert.deepEqual(await page.$eval('#shareImg', (i) => [i.naturalWidth, i.naturalHeight]), [1080, 1350]);
  assert.match(await page.evaluate(() => shareText(SHARE.result)), /Новичок|НОВИЧОК/i);
  assert.deepEqual(problems, []);
  await context.close();
});

test('страница модерации: вход по токену, статистика и таблица', async () => {
  process.env.ADMIN_TOKEN = 'test-admin-token-123';
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  try {
    await page.goto(url + 'admin.html');
    await page.fill('#token', 'wrong');
    await page.click('#auth button[type="submit"]');
    await page.waitForFunction(() => /Неверный токен/.test(document.getElementById('msg').textContent));
    await page.fill('#token', 'test-admin-token-123');
    await page.click('#auth button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    assert.ok(await page.$$eval('.tile', (t) => t.length) >= 6);
    assert.ok(Number(await page.textContent('.tile b')) > 0, 'визиты из предыдущих тестов должны посчитаться');
    assert.deepEqual(problems, []);
  } finally {
    delete process.env.ADMIN_TOKEN;
    await context.close();
  }
});
