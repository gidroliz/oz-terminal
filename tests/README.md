# Автотесты

- `data.test.js` — проверка данных: вопросы, словари паролей, журнал комплекса, переводы интерфейса.
- `e2e.test.js` — браузерные сценарии в Chromium: полное прохождение, сохранение, режимы, терминалы, язык, обучение.

Запуск:

```bash
cd tests
npm install
npx playwright install chromium
npm test
```

На GitHub тесты запускаются автоматически при каждом пуше (`.github/workflows/tests.yml`).
