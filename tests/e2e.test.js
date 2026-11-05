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
  // Плавающая точка мешает автоматическому прохождению
  await page.evaluate(() => { CFG.FLOAT_AMP = 0; });
}

// Проходит текущий этап «идеально»: замок — отмычкой точно в цель, терминал — сразу паролем
async function solveStage(page) {
  const before = await page.evaluate(() => S.cleared);
  for (let guard = 0; guard < 6; guard++) {
    const type = await page.evaluate(() => S.stages[S.stage].type);
    if (type === 'lock') {
      await page.evaluate(() => { S.angle = S.target; });
      await page.dispatchEvent('#hackBtn', 'pointerdown');
      await page.waitForFunction(() => S.rot <= 0 || S.advancing || S.finished, null, { timeout: 5000 }).catch(() => {});
      await page.waitForFunction((b) => S.cleared > b || (!S.turning && S.rot >= 89) || S.finished, before, { timeout: 5000 });
      await page.dispatchEvent('#hackBtn', 'pointerup');
    } else {
      const start = await page.evaluate(() => S.term.words.find((w) => w.w === S.term.password).start);
      await page.click(`[data-i="${start}"]`);
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
  await page.evaluate(() => { S.stage = 4; enterStage(true); });
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
  await page.evaluate(() => { S.stage = 3; enterStage(true); });
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
