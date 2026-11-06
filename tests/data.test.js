'use strict';

// Проверка данных игры: вопросы, словари паролей, журнал, переводы интерфейса.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, loadGameScripts } = require('./helpers');

const { QUESTIONS, QUESTION_TOPICS } = loadGameScripts(['questions.js'], ['QUESTIONS', 'QUESTION_TOPICS']);
const { WORDS_BY_LEN } = loadGameScripts(['words.js'], ['WORDS_BY_LEN']);
const { LORE } = loadGameScripts(['lore.js'], ['LORE']);
const { I18N } = loadGameScripts(['i18n.js'], ['I18N']);

test('у каждого вопроса есть обе локализации, 4 варианта и верный индекс', () => {
  assert.ok(QUESTIONS.length >= 60);
  QUESTIONS.forEach((q, i) => {
    assert.ok(QUESTION_TOPICS[q.cat], `вопрос ${i}: неизвестная тема ${q.cat}`);
    for (const lang of ['ru', 'en']) {
      assert.ok(q[lang] && q[lang].text, `вопрос ${i}: нет текста ${lang}`);
      assert.equal(q[lang].opts.length, 4, `вопрос ${i}: ${lang} — не 4 варианта`);
      assert.equal(new Set(q[lang].opts).size, 4, `вопрос ${i}: ${lang} — повтор вариантов`);
    }
    assert.ok(Number.isInteger(q.ok) && q.ok >= 0 && q.ok < 4, `вопрос ${i}: неверный ok`);
  });
});

test('в словарях паролей хватает слов нужной длины', () => {
  for (const lang of ['ru', 'en']) {
    for (const len of [5, 6, 7, 8]) {
      const list = WORDS_BY_LEN[lang][len] || [];
      assert.ok(list.length >= 20, `${lang}: мало слов длины ${len} (${list.length})`);
      list.forEach((w) => {
        assert.equal(w.length, len);
        assert.match(w, lang === 'ru' ? /^[А-Я]+$/ : /^[A-Z]+$/, `${lang}: странное слово ${w}`);
      });
    }
  }
});

test('у каждой записи журнала есть заголовок и текст на обоих языках', () => {
  assert.ok(LORE.length >= 10);
  LORE.forEach((e, i) => {
    for (const lang of ['ru', 'en']) {
      assert.equal(e[lang].length, 2, `запись ${i}: ${lang}`);
      assert.ok(e[lang][0] && e[lang][1], `запись ${i}: ${lang} пустая`);
    }
  });
});

test('в переводах одинаковый набор ключей и одинаковые параметры', () => {
  const ru = Object.keys(I18N.ru).sort();
  const en = Object.keys(I18N.en).sort();
  assert.deepEqual(en, ru);
  const params = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  ru.forEach((k) => assert.equal(params(I18N.en[k]), params(I18N.ru[k]), `параметры ключа ${k}`));
});

test('все ключи из разметки и кода есть в словаре', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const used = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html|-title)?="([^"]+)"/g)) used.add(m[1]);
  for (const f of ['script.js', 'terminal.js', 'minigames.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !(k in I18N.ru) && !k.endsWith('.'));
  assert.deepEqual(missing, []);
});
