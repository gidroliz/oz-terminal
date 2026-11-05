'use strict';

// ═══════════════════════════════════════════════
// ВЗЛОМ ТЕРМИНАЛА
// Дамп памяти с мусорными символами и спрятанными словами.
// Выбери слово — терминал скажет, сколько букв стоят на своих местах.
// Парные скобки в одной строке убирают ложный вариант или восстанавливают попытки.
// Типы: normal, hint (известна одна буква), shuffle (дамп перемешивается после ошибки),
// trap (часть скобок — ловушки).
// ═══════════════════════════════════════════════
const Terminal = (() => {
  const ROWS = 15;
  const COLS = 12;
  const COLUMNS = 2;
  const PER_COL = ROWS * COLS;
  const SIZE = PER_COL * COLUMNS;
  const JUNK = '!@#$%^&*-_=+|\\/;:\'",.?`~';
  const OPEN = '([{<';
  const CLOSE = ')]}>';
  const TRAP_CHANCE = 0.35;
  const LONG_PRESS_MS = 450;

  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  function likeness(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++;
    return n;
  }

  // ─── Генерация ───────────────────────────────
  function pickWords(pool, count) {
    pool = shuffle(pool);
    const password = pool[0];
    const rest = pool.slice(1).map((w) => ({ w, l: likeness(w, password) }));
    const chosen = new Set();
    const take = (list, n) => list.slice(0, n).forEach((x) => chosen.add(x.w));
    take(shuffle(rest.filter((x) => x.l >= 2)), Math.ceil((count - 1) * 0.4));
    take(shuffle(rest.filter((x) => x.l === 1 && !chosen.has(x.w))), Math.ceil((count - 1) * 0.3));
    for (const x of shuffle(rest)) {
      if (chosen.size >= count - 1) break;
      chosen.add(x.w);
    }
    return { password, words: shuffle([password, ...[...chosen].slice(0, count - 1)]) };
  }

  // Раскладывает слова и скобки по дампу заново (используется и при перемешивании)
  function layout(state) {
    const chars = Array.from({ length: SIZE }, () => {
      const r = Math.random();
      if (r < 0.06) return OPEN[rnd(4)];
      if (r < 0.12) return CLOSE[rnd(4)];
      return JUNK[rnd(JUNK.length)];
    });
    const occupied = new Array(SIZE).fill(false);
    const placed = [];
    for (const word of state.words) {
      const len = word.w.length;
      for (let tries = 0; tries < 500; tries++) {
        const start = rnd(SIZE - len);
        let ok = true;
        for (let i = start - 1; i <= start + len; i++) if (i >= 0 && i < SIZE && occupied[i]) { ok = false; break; }
        if (!ok) continue;
        for (let i = 0; i < len; i++) { chars[start + i] = word.removed ? '.' : word.w[i]; occupied[start + i] = true; }
        word.start = start;
        placed.push(word);
        break;
      }
    }
    state.words = placed;

    const pairs = 6 + (state.extraBrackets || 0);
    for (let k = 0; k < pairs; k++) {
      for (let tries = 0; tries < 60; tries++) {
        const row = rnd(ROWS * COLUMNS);
        const span = 2 + rnd(5);
        const x = rnd(COLS - span);
        const a = row * COLS + x;
        const b = a + span - 1;
        let free = true;
        for (let i = a; i <= b; i++) if (occupied[i]) { free = false; break; }
        if (!free) continue;
        const ty = rnd(4);
        chars[a] = OPEN[ty];
        for (let i = a + 1; i < b; i++) chars[i] = JUNK[rnd(JUNK.length)];
        chars[b] = CLOSE[ty];
        break;
      }
    }
    state.chars = chars.join('');
  }

  function create({ len, count, kind = 'normal', lang = 'ru', attempts = 4, extraBrackets = 0, safeBrackets = false }) {
    const dict = WORDS_BY_LEN[lang] || WORDS_BY_LEN.ru;
    while (len > 4 && (!dict[len] || dict[len].length < count)) len--;
    const { password, words } = pickWords(dict[len], count);
    const state = {
      len,
      kind,
      lang,
      chars: '',
      words: words.map((w) => ({ w, start: 0, removed: false })),
      password,
      attempts,
      max: attempts,
      wrong: 0,
      marked: [],
      trapsHit: 0,
      bracketsUsed: 0,
      extraBrackets,
      safe: safeBrackets,
      addr: 0xF000 + rnd(0x0C00) * 4,
      log: [],
      solved: false,
    };
    if (kind === 'hint') {
      const pos = rnd(len);
      state.hint = { pos, ch: password[pos] };
    }
    layout(state);
    return state;
  }

  // ─── Разбор токенов ──────────────────────────
  let T = null;
  let view = null;
  let cb = {};
  let hover = -1;
  let cursor = -1;
  let preview = null;
  let enabled = true;
  let lastPointer = 'mouse';
  let pressTimer = null;
  let suppressClick = false;

  function wordAt(i) {
    return T.words.find((w) => !w.removed && i >= w.start && i < w.start + w.w.length) || null;
  }

  function bracketAt(i) {
    const c = T.chars[i];
    const rowStart = Math.floor(i / COLS) * COLS;
    const rowEnd = rowStart + COLS - 1;
    let o = OPEN.indexOf(c);
    if (o >= 0 && !wordAt(i)) {
      for (let j = i + 1; j <= rowEnd; j++) {
        if (wordAt(j)) break;
        if (T.chars[j] === CLOSE[o]) return [i, j];
      }
    }
    o = CLOSE.indexOf(c);
    if (o >= 0 && !wordAt(i)) {
      for (let j = i - 1; j >= rowStart; j--) {
        if (wordAt(j)) break;
        if (T.chars[j] === OPEN[o]) return [j, i];
      }
    }
    return null;
  }

  function tokenAt(i) {
    if (i < 0) return null;
    const w = wordAt(i);
    if (w) return { type: 'word', a: w.start, b: w.start + w.w.length - 1, word: w, text: w.w };
    const br = bracketAt(i);
    if (br) return { type: 'bracket', a: br[0], b: br[1], text: T.chars.slice(br[0], br[1] + 1) };
    return { type: 'junk', a: i, b: i, text: T.chars[i] };
  }

  // ─── Отрисовка ───────────────────────────────
  function kindLine() {
    if (T.kind === 'hint' && T.hint) return t('term.hint', { pos: T.hint.pos + 1, ch: T.hint.ch });
    if (T.kind === 'shuffle') return t('term.shuffleNote');
    if (T.kind === 'trap') return T.safe ? t('term.trapSafe') : t('term.trapNote');
    return '';
  }

  function mount(root, state, callbacks) {
    T = state;
    T.marked = T.marked || [];
    cb = callbacks || {};
    hover = -1;
    cursor = -1;
    preview = null;
    root.innerHTML = `
      <div class="term-head">
        <div class="term-h1"></div>
        <div class="term-sub"></div>
        <div class="term-kind"></div>
        <div class="term-attempts"></div>
      </div>
      <div class="term-dump"></div>
      <div class="term-bottom">
        <div class="term-log"></div>
        <div class="term-input">&gt; <span class="term-typed"></span><span class="term-cursor">█</span></div>
        <div class="term-help"></div>
      </div>
      <div class="term-lock hidden"><div class="term-lock-box"><div class="term-lock-title"></div><div class="term-lock-sub"></div></div></div>
    `;
    view = {
      root,
      dump: root.querySelector('.term-dump'),
      attempts: root.querySelector('.term-attempts'),
      log: root.querySelector('.term-log'),
      typed: root.querySelector('.term-typed'),
      lock: root.querySelector('.term-lock'),
      lockSub: root.querySelector('.term-lock-sub'),
      spans: [],
    };
    root.querySelector('.term-lock-title').textContent = t('term.locked');
    root.querySelector('.term-help').textContent = t('term.markHelp');
    flushTyping();
    logPainted = T.log.length;
    typeInto(root.querySelector('.term-h1'), t('term.header'));
    typeInto(root.querySelector('.term-sub'), t('term.enter', { n: T.len }));
    const kl = kindLine();
    const kindEl = root.querySelector('.term-kind');
    if (kl) typeInto(kindEl, kl); else kindEl.remove();

    for (let c = 0; c < COLUMNS; c++) {
      const col = document.createElement('div');
      col.className = 'term-col';
      for (let r = 0; r < ROWS; r++) {
        const row = document.createElement('div');
        row.className = 'term-row';
        row.style.animationDelay = (r * 0.025 + c * 0.2) + 's';
        const addr = document.createElement('span');
        addr.className = 'term-addr';
        addr.textContent = '0x' + (T.addr + (c * ROWS + r) * COLS).toString(16).toUpperCase();
        row.appendChild(addr);
        const cells = document.createElement('span');
        cells.className = 'term-cells';
        for (let x = 0; x < COLS; x++) {
          const i = c * PER_COL + r * COLS + x;
          const s = document.createElement('span');
          s.dataset.i = i;
          cells.appendChild(s);
          view.spans[i] = s;
        }
        row.appendChild(cells);
        col.appendChild(row);
      }
      view.dump.appendChild(col);
    }

    view.dump.addEventListener('pointermove', onPointerMove);
    view.dump.addEventListener('pointerleave', () => { if (!preview) setHover(-1); });
    view.dump.addEventListener('pointerdown', onPointerDown);
    view.dump.addEventListener('pointerup', cancelPress);
    view.dump.addEventListener('pointercancel', cancelPress);
    view.dump.addEventListener('click', onClick);
    view.dump.addEventListener('contextmenu', onContextMenu);
    paintChars();
    paintAttempts();
    paintLog();
  }

  function paintChars() {
    for (let i = 0; i < SIZE; i++) {
      view.spans[i].textContent = T.chars[i];
      view.spans[i].classList.remove('mk');
    }
    T.words.forEach((w) => {
      if (w.removed || !T.marked.includes(w.w)) return;
      for (let i = w.start; i < w.start + w.w.length; i++) view.spans[i].classList.add('mk');
    });
    paintHover();
  }

  function paintAttempts() {
    const blocks = Array.from({ length: T.max }, (_, i) => `<span class="${i < T.attempts ? 'on' : ''}">■</span>`).join('');
    view.attempts.innerHTML = `${t('term.attempts', { n: T.attempts })} ${blocks}`;
    view.attempts.classList.toggle('warn', T.attempts === 1);
  }

  // ─── Эффект печати ───────────────────────────
  let typing = true;
  let queue = [];
  let typeTimer = null;
  let logPainted = 0;

  function typeInto(el, text) {
    if (!typing) { el.textContent = text; return; }
    el.textContent = '';
    queue.push({ el, text, pos: 0 });
    if (!typeTimer) typeTimer = setInterval(typeStep, 14);
  }

  function typeStep() {
    const job = queue[0];
    if (!job) { clearInterval(typeTimer); typeTimer = null; return; }
    job.pos += 1;
    job.el.textContent = job.text.slice(0, job.pos);
    if (job.pos % 2 === 0) cb.sound && cb.sound('type');
    if (job.pos >= job.text.length) queue.shift();
  }

  function flushTyping() {
    queue.forEach((j) => { j.el.textContent = j.text; });
    queue = [];
    clearInterval(typeTimer);
    typeTimer = null;
  }

  function paintLog() {
    flushTyping();
    view.log.innerHTML = '';
    const from = Math.max(0, T.log.length - 4);
    T.log.slice(from).forEach((l, k) => {
      const d = document.createElement('div');
      if (l.k) d.className = l.k;
      view.log.appendChild(d);
      if (from + k >= logPainted) typeInto(d, '>' + l.t);
      else d.textContent = '>' + l.t;
    });
    logPainted = T.log.length;
  }

  function setTyping(on) { typing = on; if (!on) flushTyping(); }

  let lit = [];
  function paintHover() {
    lit.forEach((s) => s.classList.remove('hl'));
    lit = [];
    const tok = tokenAt(hover);
    if (!tok) { view.typed.textContent = ''; return; }
    for (let i = tok.a; i <= tok.b; i++) { view.spans[i].classList.add('hl'); lit.push(view.spans[i]); }
    view.typed.textContent = tok.text;
  }

  function setHover(i) {
    if (i === hover) return;
    const before = tokenAt(hover);
    hover = i;
    const after = tokenAt(hover);
    if (after && (!before || before.a !== after.a)) cb.sound && cb.sound('key');
    paintHover();
  }

  // ─── Пометки слов ────────────────────────────
  function toggleMark(word) {
    if (!word || word.removed || T.solved) return;
    const i = T.marked.indexOf(word.w);
    if (i >= 0) T.marked.splice(i, 1); else T.marked.push(word.w);
    cb.sound && cb.sound('key');
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    paintChars();
    cb.onChange && cb.onChange(T);
  }

  // ─── Ввод ────────────────────────────────────
  function idxFromEvent(e) {
    const el = e.target.closest('[data-i]');
    return el ? +el.dataset.i : -1;
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch') { cancelPress(); return; }
    if (!enabled || preview) return;
    const i = idxFromEvent(e);
    if (i >= 0) setHover(i);
  }

  function onPointerDown(e) {
    lastPointer = e.pointerType;
    suppressClick = false;
    if (e.pointerType !== 'touch' || !enabled) return;
    const i = idxFromEvent(e);
    const w = i >= 0 ? wordAt(i) : null;
    if (!w) return;
    cancelPress();
    pressTimer = setTimeout(() => {
      pressTimer = null;
      suppressClick = true;
      preview = null;
      toggleMark(w);
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  }

  function onContextMenu(e) {
    e.preventDefault();
    if (!enabled) return;
    const i = idxFromEvent(e);
    const w = i >= 0 ? wordAt(i) : null;
    if (w && lastPointer !== 'touch') toggleMark(w);
  }

  function onClick(e) {
    if (suppressClick) { suppressClick = false; return; }
    if (!enabled || T.solved) return;
    const i = idxFromEvent(e);
    if (i < 0) return;
    const tok = tokenAt(i);
    const touch = lastPointer === 'touch' || e.pointerType === 'touch';
    if (touch) {
      if (!preview || preview.a !== tok.a) {
        preview = tok;
        setHover(i);
        return;
      }
    }
    preview = null;
    select(tok);
  }

  function addLog(text, k) {
    T.log.push({ t: text, k });
    if (T.log.length > 40) T.log.shift();
  }

  function select(tok) {
    if (!tok || T.solved || T.attempts <= 0) return;
    addLog(tok.text);

    if (tok.type === 'word') {
      if (tok.word.w === T.password) {
        T.solved = true;
        addLog(t('term.accepted'), 'good');
        addLog(t('term.granted'), 'good');
        paintLog();
        cb.onSolved && cb.onSolved(T);
        return;
      }
      T.attempts--;
      T.wrong++;
      addLog(t('term.denied'), 'bad');
      addLog(t('term.likeness', { n: likeness(tok.word.w, T.password), len: T.len }));
      if (T.kind === 'shuffle' && T.attempts > 0) {
        layout(T);
        hover = -1;
        preview = null;
        addLog(t('term.shuffled'));
      }
      paintChars();
      paintAttempts();
      paintLog();
      cb.sound && cb.sound('denied');
      cb.onChange && cb.onChange(T);
      if (T.attempts <= 0) cb.onLockout && cb.onLockout(T);
      return;
    }

    if (tok.type === 'bracket') {
      T.chars = T.chars.slice(0, tok.a) + '.' + T.chars.slice(tok.a + 1);
      if (tok.b !== tok.a) T.chars = T.chars.slice(0, tok.b) + '.' + T.chars.slice(tok.b + 1);
      T.bracketsUsed++;
      if (T.kind === 'trap' && !T.safe && Math.random() < TRAP_CHANCE) {
        T.attempts--;
        T.trapsHit++;
        addLog(t('term.trap'), 'bad');
        paintChars();
        paintAttempts();
        paintLog();
        cb.sound && cb.sound('denied');
        cb.onChange && cb.onChange(T);
        if (T.attempts <= 0) cb.onLockout && cb.onLockout(T);
        return;
      }
      if ((T.attempts < T.max && Math.random() < 0.25) || !dudsLeft()) {
        T.attempts = T.max;
        addLog(t('term.restored'), 'good');
      } else {
        dropDud();
        addLog(t('term.dudRemoved'), 'good');
      }
      paintChars();
      paintAttempts();
      paintLog();
      cb.sound && cb.sound('bracket');
      cb.onChange && cb.onChange(T);
      return;
    }

    addLog(t('term.inputError'));
    paintLog();
    cb.sound && cb.sound('key');
  }

  function dudsLeft() {
    return T.words.filter((w) => !w.removed && w.w !== T.password).length;
  }

  function dropDud() {
    // Сначала убираем непомеченные — помеченные игрок и так уже исключил
    const duds = T.words.filter((w) => !w.removed && w.w !== T.password);
    const fresh = duds.filter((w) => !T.marked.includes(w.w));
    const pool = fresh.length ? fresh : duds;
    const d = pool[rnd(pool.length)];
    d.removed = true;
    T.chars = T.chars.slice(0, d.start) + '.'.repeat(d.w.length) + T.chars.slice(d.start + d.w.length);
  }

  function scan() {
    if (!T || T.solved || !dudsLeft()) return false;
    dropDud();
    addLog(t('term.scanned'), 'good');
    preview = null;
    hover = -1;
    paintChars();
    paintLog();
    cb.onChange && cb.onChange(T);
    return true;
  }

  function canScan() { return !!T && !T.solved && dudsLeft() > 0; }

  function moveCursor(dx, dy) {
    if (cursor < 0) cursor = hover >= 0 ? hover : 0;
    let c = Math.floor(cursor / PER_COL);
    let r = Math.floor((cursor % PER_COL) / COLS);
    let x = cursor % COLS;
    if (dx) {
      const tok = tokenAt(cursor);
      if (tok && tok.type === 'word') {
        const edge = dx > 0 ? tok.b : tok.a;
        c = Math.floor(edge / PER_COL); r = Math.floor((edge % PER_COL) / COLS); x = edge % COLS;
      }
      x += dx;
      if (x < 0) { if (c > 0) { c--; x = COLS - 1; } else if (r > 0) { r--; x = COLS - 1; } else x = 0; }
      if (x >= COLS) { if (c < COLUMNS - 1) { c++; x = 0; } else if (r < ROWS - 1) { r++; x = 0; } else x = COLS - 1; }
    }
    if (dy) r = Math.max(0, Math.min(ROWS - 1, r + dy));
    cursor = c * PER_COL + r * COLS + x;
    preview = null;
    setHover(cursor);
  }

  function handleKey(e) {
    if (!T || !enabled || T.solved) return false;
    const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (map[e.key]) { e.preventDefault(); moveCursor(...map[e.key]); return true; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (hover >= 0) select(tokenAt(hover));
      return true;
    }
    const k = e.key.toLowerCase();
    if (k === 'x' || k === 'ч') {
      const w = hover >= 0 ? wordAt(hover) : null;
      if (w) toggleMark(w);
      return true;
    }
    return false;
  }

  function setEnabled(on) { enabled = on; if (!on) cancelPress(); }

  function showLock(secondsLeft) {
    if (!view) return;
    view.lock.classList.toggle('hidden', secondsLeft <= 0);
    view.lockSub.textContent = t('term.reboot', { n: Math.ceil(secondsLeft) });
  }

  return { create, mount, handleKey, setEnabled, showLock, likeness, scan, canScan, setTyping, flushTyping };
})();
