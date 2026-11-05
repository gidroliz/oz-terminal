'use strict';

// ═══════════════════════════════════════════════
// ВЗЛОМ ТЕРМИНАЛА
// Дамп памяти с мусорными символами и спрятанными словами.
// Выбери слово — терминал скажет, сколько букв стоят на своих местах.
// Парные скобки в одной строке убирают ложный вариант или восстанавливают попытки.
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
  function pickWords(len, count) {
    const pool = shuffle(WORDS_BY_LEN[len] || []);
    const password = pool[0];
    const rest = pool.slice(1).map((w) => ({ w, l: likeness(w, password) }));
    const chosen = new Set();
    const take = (list, n) => list.slice(0, n).forEach((x) => chosen.add(x.w));
    // Подмешиваем «близкие» слова, чтобы было что анализировать
    take(shuffle(rest.filter((x) => x.l >= 2)), Math.ceil((count - 1) * 0.4));
    take(shuffle(rest.filter((x) => x.l === 1 && !chosen.has(x.w))), Math.ceil((count - 1) * 0.3));
    for (const x of shuffle(rest)) {
      if (chosen.size >= count - 1) break;
      chosen.add(x.w);
    }
    return shuffle([password, ...[...chosen].slice(0, count - 1)]).map((w) => ({ w, pw: w === password }));
  }

  function create({ len, count, attempts = 4 }) {
    const chars = Array.from({ length: SIZE }, () => {
      const r = Math.random();
      if (r < 0.06) return OPEN[rnd(4)];
      if (r < 0.12) return CLOSE[rnd(4)];
      return JUNK[rnd(JUNK.length)];
    });
    const occupied = new Array(SIZE).fill(false);
    const words = [];
    let password = '';

    for (const { w, pw } of pickWords(len, count)) {
      for (let tries = 0; tries < 500; tries++) {
        const start = rnd(SIZE - len);
        let ok = true;
        for (let i = start - 1; i <= start + len; i++) if (i >= 0 && i < SIZE && occupied[i]) { ok = false; break; }
        if (!ok) continue;
        for (let i = 0; i < len; i++) { chars[start + i] = w[i]; occupied[start + i] = true; }
        words.push({ w, start, removed: false });
        if (pw) password = w;
        break;
      }
    }
    if (!password) password = words[0].w; // крайне маловероятно, но страхуемся

    // Гарантированные скобочные пары
    for (let k = 0; k < 6; k++) {
      for (let tries = 0; tries < 60; tries++) {
        const row = rnd(ROWS * COLUMNS);
        const span = 2 + rnd(5);
        const x = rnd(COLS - span);
        const a = row * COLS + x;
        const b = a + span - 1;
        let free = true;
        for (let i = a; i <= b; i++) if (occupied[i]) { free = false; break; }
        if (!free) continue;
        const t = rnd(4);
        chars[a] = OPEN[t];
        for (let i = a + 1; i < b; i++) chars[i] = JUNK[rnd(JUNK.length)];
        chars[b] = CLOSE[t];
        break;
      }
    }

    return {
      len,
      chars: chars.join(''),
      words,
      password,
      attempts,
      max: attempts,
      wrong: 0,
      addr: 0xF000 + rnd(0x0C00) * 4,
      log: [],
      solved: false,
    };
  }

  // ─── Разбор токенов ──────────────────────────
  let T = null;        // текущее состояние
  let view = null;     // DOM-узлы
  let cb = {};
  let hover = -1;
  let cursor = -1;
  let preview = null;  // токен, выбранный первым тапом на сенсорном экране
  let enabled = true;
  let lastPointer = 'mouse';

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
  function mount(root, state, callbacks) {
    T = state;
    cb = callbacks || {};
    hover = -1;
    cursor = -1;
    preview = null;
    root.innerHTML = `
      <div class="term-head">
        <div>ROBUST-OS // ПРОТОКОЛ ДОСТУПА</div>
        <div class="term-sub">ВВЕДИТЕ ПАРОЛЬ <span class="term-len"></span></div>
        <div class="term-attempts"></div>
      </div>
      <div class="term-dump"></div>
      <div class="term-bottom">
        <div class="term-log"></div>
        <div class="term-input">&gt; <span class="term-typed"></span><span class="term-cursor">█</span></div>
      </div>
      <div class="term-lock hidden"><div class="term-lock-box"><div>ТЕРМИНАЛ ЗАБЛОКИРОВАН</div><div class="term-lock-sub"></div></div></div>
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
    root.querySelector('.term-len').textContent = `(${T.len} БУКВ)`;

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
    view.dump.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
    view.dump.addEventListener('click', onClick);
    paintChars();
    paintAttempts();
    paintLog();
  }

  function paintChars() {
    for (let i = 0; i < SIZE; i++) view.spans[i].textContent = T.chars[i];
    paintHover();
  }

  function paintAttempts() {
    const blocks = Array.from({ length: T.max }, (_, i) => `<span class="${i < T.attempts ? 'on' : ''}">■</span>`).join('');
    view.attempts.innerHTML = `ПОПЫТОК: ${T.attempts} ${blocks}`;
    view.attempts.classList.toggle('warn', T.attempts === 1);
  }

  function paintLog() {
    view.log.innerHTML = '';
    T.log.slice(-4).forEach((l) => {
      const d = document.createElement('div');
      d.textContent = '>' + l.t;
      if (l.k) d.className = l.k;
      view.log.appendChild(d);
    });
  }

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

  // ─── Ввод ────────────────────────────────────
  function idxFromEvent(e) {
    const el = e.target.closest('[data-i]');
    return el ? +el.dataset.i : -1;
  }

  function onPointerMove(e) {
    if (!enabled || e.pointerType === 'touch' || preview) return;
    const i = idxFromEvent(e);
    if (i >= 0) setHover(i);
  }

  function onClick(e) {
    if (!enabled || T.solved) return;
    const i = idxFromEvent(e);
    if (i < 0) return;
    const tok = tokenAt(i);
    const touch = lastPointer === 'touch' || e.pointerType === 'touch';
    if (touch) {
      // На телефоне: первый тап — выделить, второй по тому же — ввести
      if (!preview || preview.a !== tok.a) {
        preview = tok;
        setHover(i);
        return;
      }
    }
    preview = null;
    select(tok);
  }

  function addLog(t, k) {
    T.log.push({ t, k });
    if (T.log.length > 40) T.log.shift();
  }

  function select(tok) {
    if (!tok || T.solved || T.attempts <= 0) return;
    addLog(tok.text);

    if (tok.type === 'word') {
      if (tok.word.w === T.password) {
        T.solved = true;
        addLog('Пароль принят.', 'good');
        addLog('Доступ разрешён.', 'good');
        paintLog();
        cb.onSolved && cb.onSolved(T);
        return;
      }
      T.attempts--;
      T.wrong++;
      addLog('Отказ в доступе.', 'bad');
      addLog(`Совпадение=${likeness(tok.word.w, T.password)}/${T.len}`);
      paintAttempts();
      paintLog();
      cb.sound && cb.sound('denied');
      cb.onChange && cb.onChange(T);
      if (T.attempts <= 0) cb.onLockout && cb.onLockout(T);
      return;
    }

    if (tok.type === 'bracket') {
      // Скобка срабатывает один раз
      T.chars = T.chars.slice(0, tok.a) + '.' + T.chars.slice(tok.a + 1);
      if (tok.b !== tok.a) T.chars = T.chars.slice(0, tok.b) + '.' + T.chars.slice(tok.b + 1);
      const duds = T.words.filter((w) => !w.removed && w.w !== T.password);
      if ((T.attempts < T.max && Math.random() < 0.25) || duds.length === 0) {
        T.attempts = T.max;
        addLog('Попытки восстановлены.', 'good');
      } else {
        const d = duds[rnd(duds.length)];
        d.removed = true;
        T.chars = T.chars.slice(0, d.start) + '.'.repeat(d.w.length) + T.chars.slice(d.start + d.w.length);
        addLog('Ложный вариант удалён.', 'good');
      }
      paintChars();
      paintAttempts();
      paintLog();
      cb.sound && cb.sound('bracket');
      cb.onChange && cb.onChange(T);
      return;
    }

    addLog('Ошибка ввода.');
    paintLog();
    cb.sound && cb.sound('key');
  }

  function moveCursor(dx, dy) {
    if (cursor < 0) cursor = hover >= 0 ? hover : 0;
    let c = Math.floor(cursor / PER_COL);
    let r = Math.floor((cursor % PER_COL) / COLS);
    let x = cursor % COLS;
    if (dx) {
      // Перепрыгиваем через слово целиком
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
    return false;
  }

  function setEnabled(on) { enabled = on; }

  function showLock(secondsLeft) {
    if (!view) return;
    view.lock.classList.toggle('hidden', secondsLeft <= 0);
    view.lockSub.textContent = `ПЕРЕЗАГРУЗКА ЧЕРЕЗ ${Math.ceil(secondsLeft)} С...`;
  }

  return { create, mount, handleKey, setEnabled, showLock, likeness };
})();
