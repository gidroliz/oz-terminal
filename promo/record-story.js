// Записывает геймплей для истории 1080x1920 и делает постер
const { chromium } = require('playwright');
const out = process.argv[2];
const W = 1080, H = 1920;
const OVERLAY = `
  body { align-items: flex-start !important; padding: 500px 0 0 !important; }
  .pipboy { zoom: 1.85; margin: 0 auto; }
  #promoTop { position: fixed; left: 0; right: 0; top: 200px; text-align: center; z-index: 2000; pointer-events: none;
    font-family: 'VT323', monospace; font-size: 120px; letter-spacing: 8px; line-height: 1; color: #33ff33; text-shadow: 0 0 14px #33ff33, 0 0 40px rgba(51,255,51,.5); }
  #promoTop small { display: block; font-family: 'Ubuntu Mono', monospace; font-size: 40px; letter-spacing: 6px; color: #ffb000; text-shadow: 0 0 12px rgba(255,176,0,.6); margin-top: 16px; }
  #promoTop em { display: block; font-style: normal; font-family: 'Ubuntu Mono', monospace; font-size: 36px; letter-spacing: 2px; color: #c8ffc0; text-shadow: 0 0 8px rgba(51,255,51,.5); margin-top: 14px; }
  #toast { display: none !important; }
  .win-box { zoom: 2.1; }
  .win-overlay { align-items: flex-start !important; padding-top: 520px !important; }
  #promoTop em b { color: #33ff33; font-weight: normal; }
`;
(async () => {
  const b = await chromium.launch();
  const mk = async (video) => {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, ...(video ? { recordVideo: { dir: out + '/raw5', size: { width: W, height: H } } } : {}) });
    await ctx.addInitScript(() => { localStorage.clear(); localStorage.setItem('oz.tutorial', 'done'); localStorage.setItem('oz.settings', JSON.stringify({ lang: 'ru', vibro: false })); localStorage.setItem('oz.sound', 'off'); });
    const pageT0 = Date.now(); // запись видео начинается вместе со страницей
    const p = await ctx.newPage();
    p.pageT0 = pageT0;
    await p.goto('http://localhost:8123/');
    // Журнал звуков и состояния замка для синхронизации саундтрека
    await p.evaluate(() => {
      window.__ev = [];
      for (const k of Object.keys(Sound)) { const f = Sound[k]; Sound[k] = (...a) => { __ev.push({ n: k, t: Date.now() }); return f(...a); }; }
      window.__st = [];
      (function smp() { __st.push({ t: Date.now(), j: S.jammed ? 1 : 0, tr: S.turning ? 1 : 0, rot: S.rot, w: S.wear, tab: isLock() ? 'lock' : 'term', fin: S.finished ? 1 : 0 }); requestAnimationFrame(smp); })();
      document.getElementById('startBtn').addEventListener('click', () => { window.__click = Date.now(); }, true);
    });
    await p.addStyleTag({ content: OVERLAY });
    await p.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="promoTop">OZ-TERMINAL<small>ВЗЛОМАЙ, ЕСЛИ СМОЖЕШЬ</small><em>&gt; <b>oz-terminal.vercel.app</b></em></div>');
    });
    await p.click('#startBtn');
    await p.evaluate(() => { CFG.FLOAT_AMP = 0; S.journal = []; renderLog(); resizeCanvas(); });
    await p.waitForTimeout(300);
    return { ctx, p };
  };
  const glide = async (p, to, ms) => {
    await p.evaluate(async ({ to, ms }) => {
      const from = S.angle, t0 = performance.now();
      await new Promise((res) => { const f = () => { const k = Math.min(1, (performance.now() - t0) / ms); setAngle(from + (to - from) * (1 - Math.pow(1 - k, 3))); k < 1 ? requestAnimationFrame(f) : res(); }; f(); });
    }, { to, ms });
  };

  // ── Видео ──
  const { ctx, p } = await mk(true);
  const target = await p.evaluate(() => S.target);
  const wrong = target > 0 ? target - 34 : target + 34;
  await p.waitForTimeout(400);
  await glide(p, wrong, 900);
  await p.dispatchEvent('#hackBtn', 'pointerdown');
  await p.waitForTimeout(1500);                       // заклинивает, трясётся
  await p.dispatchEvent('#hackBtn', 'pointerup');
  await p.waitForTimeout(400);
  await glide(p, target + 1, 1000);
  await p.dispatchEvent('#hackBtn', 'pointerdown');
  await p.waitForTimeout(1500);                       // открывается
  await p.dispatchEvent('#hackBtn', 'pointerup');
  await p.waitForTimeout(1500);                       // переход к терминалу, печать заголовка
  const words = await p.evaluate(() => S.term.words.filter((w) => w.w !== S.term.password).slice(0, 2).map((w) => w.start));
  const pw = await p.evaluate(() => S.term.words.find((w) => w.w === S.term.password).start);
  await p.hover(`[data-i="${words[0]}"]`); await p.waitForTimeout(500);
  await p.click(`[data-i="${words[0]}"]`); await p.waitForTimeout(1300);
  await p.hover(`[data-i="${pw}"]`); await p.waitForTimeout(600);
  await p.click(`[data-i="${pw}"]`); await p.waitForTimeout(1200);
  // Финал: показываем экран победы
  await p.evaluate(() => { S.cleared = 5; S.stars = [[1,1,1],[1,1,1],[1,1,0],[1,1,1],[1,1,1]]; S.done = [true,true,true,true,true]; S.elapsed = 97000; endGame(true); });
  await p.waitForTimeout(3600);
  const log = await p.evaluate(() => ({ ev: __ev, st: __st, click: __click }));
  require('fs').writeFileSync(out + '/events.json', JSON.stringify({ t0: p.pageT0, ...log }));
  const vpath = await p.video().path();
  await ctx.close();
  console.log('VIDEO', vpath);

  // ── Постер: момент заклинивания ──
  const s = await mk(false);
  const tg = await s.p.evaluate(() => S.target);
  await s.p.evaluate((a) => { setAngle(a); }, tg > 0 ? tg - 30 : tg + 30);
  await s.p.dispatchEvent('#hackBtn', 'pointerdown');
  await s.p.waitForTimeout(800);
  await s.p.screenshot({ path: out + '/poster.png' });
  await s.ctx.close();
  await b.close();
})();
