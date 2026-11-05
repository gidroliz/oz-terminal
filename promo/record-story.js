'use strict';

// Запись тизера для историй (1080×1920) с журналом звуковых событий для саундтрека.
// Игра запускается на тестовом сервере (tests/helpers) с таблицей рекордов на базе в памяти.
// Запуск: node promo/record-story.js <папка-для-результатов> [--poster-only]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startServer } = require('../tests/helpers');
const redis = require('../api/_lib/redis');

const out = path.resolve(process.argv[2] || '.');
const W = 1080;
const H = 1920;
const PLAYER_ID = 'promoplayer0000000000000';

const OVERLAY = `
  body { align-items: flex-start !important; padding: 500px 0 0 !important; }
  .pipboy { zoom: 1.85; margin: 0 auto; }
  #toast, #coach { display: none !important; }
  .win-box { zoom: 2.1; }
  .win-overlay { align-items: flex-start !important; padding-top: 520px !important; }
  #promoTop { position: fixed; left: 0; right: 0; top: 190px; z-index: 2000; text-align: center; pointer-events: none; }
  #promoBrand { font-family: 'VT323', monospace; font-size: 64px; letter-spacing: 8px; line-height: 1; color: #33ff33;
    text-shadow: 0 0 12px #33ff33, 0 0 30px rgba(51,255,51,.45); }
  #promoCap { margin-top: 18px; min-height: 140px; font-family: 'Ubuntu Mono', monospace; font-size: 60px; line-height: 1.12; letter-spacing: 2px;
    color: #ffb000; text-shadow: 0 0 14px rgba(255,176,0,.7), 0 0 34px rgba(255,176,0,.35); white-space: pre-line; padding: 0 40px; }
  #promoUrl { margin-top: 14px; font-family: 'Ubuntu Mono', monospace; font-size: 40px; letter-spacing: 2px; color: #c8ffc0; text-shadow: 0 0 8px rgba(51,255,51,.5); }
  #promoCap::after { content: '█'; color: #ffb000; animation: blink 1s step-end infinite; margin-left: 4px; }
  #promoCta { position: fixed; inset: 0; z-index: 3000; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 42%, #0b230b 0%, #020502 70%); opacity: 0; transition: opacity .5s ease; pointer-events: none;
    font-family: 'Ubuntu Mono', monospace; text-align: center; padding-bottom: 160px; }
  #promoCta.on { opacity: 1; }
  #promoCta::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 2px, transparent 2px 5px); }
  #promoCta .t1 { font-family: 'VT323', monospace; font-size: 150px; letter-spacing: 10px; color: #33ff33; text-shadow: 0 0 18px #33ff33, 0 0 50px rgba(51,255,51,.5); }
  #promoCta .t2 { font-size: 54px; letter-spacing: 6px; color: #ffb000; text-shadow: 0 0 14px rgba(255,176,0,.6); margin-top: 26px; }
  #promoCta .t3 { margin-top: 60px; font-size: 52px; color: #c8ffc0; border: 4px solid #33ff33; border-radius: 10px; padding: 26px 40px;
    box-shadow: 0 0 30px rgba(51,255,51,.35), inset 0 0 20px rgba(51,255,51,.12); text-shadow: 0 0 10px rgba(51,255,51,.6); }
  #promoCta .t4 { margin-top: 90px; font-size: 46px; letter-spacing: 4px; color: #33ff33; text-shadow: 0 0 12px #33ff33; }
  #promoCta .arrow { font-size: 110px; color: #ffb000; text-shadow: 0 0 16px #ffb000; animation: bob 0.9s ease-in-out infinite; margin-top: 10px; }
  @keyframes bob { 50% { transform: translateY(26px); } }
`;

async function seedLeaderboard(base) {
  const post = async (p, b) => (await fetch(base + 'api/' + p, { method: 'POST', body: JSON.stringify(b) })).json();
  // Условные соперники — явно не реальные люди
  const rows = [['ДРУГ_1', 112000, 1, 13], ['СОСЕД', 127000, 2, 12], ['КОЛЛЕГА', 151000, 2, 10], ['ДРУГ_2', 185000, 4, 8]];
  for (const [i, [name, time, broken, stars]] of rows.entries()) {
    const r = await post('run', { mode: 'normal' });
    await redis.call('SET', `run:${r.token}`, JSON.stringify({ mode: 'normal', t: Date.now() - 600000 }), 'EX', 600);
    await post('score', { token: r.token, id: `seedrival${i}`.padEnd(20, '0'), name, mode: 'normal', time, stages: 5, broken, stars });
  }
}

async function openPage(browser, base, video) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    ...(video ? { recordVideo: { dir: path.join(out, 'raw'), size: { width: W, height: H } } } : {}),
  });
  await ctx.addInitScript((id) => {
    localStorage.clear();
    localStorage.setItem('oz.tutorial', 'done');
    localStorage.setItem('oz.settings', JSON.stringify({ lang: 'ru', vibro: false }));
    localStorage.setItem('oz.sound', 'off');
    localStorage.setItem('oz.player', JSON.stringify({ id, name: 'ТВОЙ ПОЗЫВНОЙ' }));
  }, PLAYER_ID);
  const pageT0 = Date.now(); // запись видео начинается вместе со страницей
  const p = await ctx.newPage();
  await p.goto(base);
  await p.addStyleTag({ content: OVERLAY });
  await p.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="promoTop"><div id="promoBrand">OZ-TERMINAL</div><div id="promoCap"></div></div>
      <div id="promoCta">
        <div class="t1">OZ-TERMINAL</div>
        <div class="t2">ИГРАЙ ПРЯМО СЕЙЧАС</div>
        <div class="t3">oz-terminal.vercel.app</div>
        <div class="t4">ЖМИ НА ССЫЛКУ</div>
        <div class="arrow">↓</div>
      </div>`);
    // Журнал звуков и состояния замка для синхронизации саундтрека
    window.__ev = [];
    for (const k of Object.keys(Sound)) { const f = Sound[k]; Sound[k] = (...a) => { __ev.push({ n: k, t: Date.now() }); return f(...a); }; }
    window.__st = [];
    (function smp() { __st.push({ t: Date.now(), j: S.jammed ? 1 : 0, tr: S.turning ? 1 : 0, rot: S.rot, w: S.wear }); requestAnimationFrame(smp); })();
    // Надпись печатается по буквам
    window.caption = (text) => new Promise((res) => {
      const el = document.getElementById('promoCap');
      el.textContent = '';
      let i = 0;
      const step = () => {
        i++;
        el.textContent = text.slice(0, i);
        if (i % 2 === 0 && text[i - 1] !== ' ') __ev.push({ n: 'caption', t: Date.now() });
        if (i < text.length) setTimeout(step, 38); else res();
      };
      step();
    });
  });
  await p.click('#startBtn');
  await p.evaluate(() => { CFG.FLOAT_AMP = 0; S.journal = []; renderLog(); resizeCanvas(); });
  await p.waitForTimeout(250);
  return { ctx, p, pageT0 };
}

async function glide(p, to, ms) {
  await p.evaluate(async ({ to, ms }) => {
    const from = S.angle;
    const t0 = performance.now();
    await new Promise((res) => {
      const f = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        setAngle(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(f); else res();
      };
      f();
    });
  }, { to, ms });
}

async function backdateToken(p, ms) {
  await p.waitForFunction(() => !!S.runToken, null, { timeout: 5000 });
  const token = await p.evaluate(() => S.runToken);
  const raw = JSON.parse(await redis.call('GET', `run:${token}`));
  raw.t -= ms;
  await redis.call('SET', `run:${token}`, JSON.stringify(raw), 'EX', 600);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const { server, url: base } = await startServer();
  await seedLeaderboard(base);
  const browser = await chromium.launch();

  if (!process.argv.includes('--poster-only')) await recordVideo(browser, base);
  await makePoster(browser, base);
  await browser.close();
  server.close();
})();

async function recordVideo(browser, base) {
  const { ctx, p, pageT0 } = await openPage(browser, base, true);
  const mark = (n) => p.evaluate((n) => __ev.push({ n, t: Date.now() }), n);
  const target = await p.evaluate(() => S.target);
  const wrong = target > 0 ? target - 34 : target + 34;

  // Акт 1: замок
  p.evaluate(() => caption('СМОЖЕШЬ ВСКРЫТЬ ЗАМОК?'));
  await p.waitForTimeout(300);
  await glide(p, wrong, 900);
  await p.dispatchEvent('#hackBtn', 'pointerdown');
  await p.waitForTimeout(1500);
  await p.dispatchEvent('#hackBtn', 'pointerup');
  await p.waitForTimeout(400);
  await glide(p, target + 1, 1000);
  await p.dispatchEvent('#hackBtn', 'pointerdown');
  await p.waitForTimeout(1500);
  await p.dispatchEvent('#hackBtn', 'pointerup');
  await p.waitForTimeout(1300);

  // Акт 2: терминал
  p.evaluate(() => caption('А ВЗЛОМАТЬ\nТЕРМИНАЛ?'));
  const words = await p.evaluate(() => S.term.words.filter((w) => w.w !== S.term.password).slice(0, 2).map((w) => w.start));
  const pw = await p.evaluate(() => S.term.words.find((w) => w.w === S.term.password).start);
  await p.waitForTimeout(500);
  await p.hover(`[data-i="${words[0]}"]`); await p.waitForTimeout(500);
  await p.click(`[data-i="${words[0]}"]`); await p.waitForTimeout(1300);
  await p.hover(`[data-i="${pw}"]`); await p.waitForTimeout(600);
  await p.click(`[data-i="${pw}"]`); await p.waitForTimeout(1100);

  // Акт 3: финал и таблица рекордов
  await backdateToken(p, 300000);
  await p.evaluate(() => {
    S.cleared = 5; S.done = [true, true, true, true, true];
    S.stars = [[1, 1, 1], [1, 1, 1], [1, 1, 0], [1, 1, 1], [1, 1, 1]];
    S.elapsed = 97000;
    endGame(true);
  });
  p.evaluate(() => caption('ПОКАЖИ СЕБЯ —\nПОПАДИ В ТОП'));
  await p.waitForSelector('.lb-place', { timeout: 5000 });
  await p.waitForTimeout(2600);
  await p.click('#endLbOpen');
  await p.waitForSelector('.lb-row.me', { timeout: 5000 });
  await p.waitForTimeout(3000);

  // Акт 4: призыв
  await mark('cta');
  await p.evaluate(() => { document.getElementById('promoTop').style.display = 'none'; document.getElementById('promoCta').classList.add('on'); });
  await p.waitForTimeout(4800);

  const log = await p.evaluate(() => ({ ev: __ev, st: __st }));
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ t0: pageT0, ...log }));
  const videoPath = await p.video().path();
  await ctx.close();
  console.log('VIDEO', videoPath);
}

// Постер: момент заклинивания, надпись и адрес сайта
async function makePoster(browser, base) {
  const s = await openPage(browser, base, false);
  const tg = await s.p.evaluate(() => S.target);
  await s.p.evaluate((a) => setAngle(a), tg > 0 ? tg - 30 : tg + 30);
  await s.p.evaluate(() => {
    const cap = document.getElementById('promoCap');
    cap.textContent = 'ВЗЛОМАЙ —\nПОПАДИ В ТОП';
    cap.style.minHeight = '0';
    cap.insertAdjacentHTML('afterend', '<div id="promoUrl">&gt; oz-terminal.vercel.app</div>');
  });
  await s.p.dispatchEvent('#hackBtn', 'pointerdown');
  await s.p.waitForTimeout(800);
  await s.p.screenshot({ path: path.join(out, 'poster.png') });
  await s.ctx.close();
}
