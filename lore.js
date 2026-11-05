'use strict';

// Записи журнала комплекса OZ-7. Расшифровываются по одной за каждый пройденный этап.
const LORE = [
  {
    ru: ['ЖУРНАЛ ДЕЖУРНОГО · 03.07', 'Установили новую систему безопасности «ПРИВРАТНИК». Директор Кравец говорит, что замки «умные» и учатся на попытках взлома. В столовой шутят, что скоро и за супом без пароля не пустят.'],
    en: ['DUTY LOG · 07/03', 'The new GATEKEEPER security system is installed. Director Kravets says the locks are "smart" and learn from every break-in attempt. In the canteen we joke that soon you will need a password for soup.'],
  },
  {
    ru: ['ИНЖЕНЕР ЛОСЕВА · ЗАМЕТКИ', 'ПРИВРАТНИК каждую ночь сам меняет пароли терминалов и берёт слова из нашего же словаря. Если ошибиться, он сообщает, сколько букв совпало. Я называю это вежливостью машины.'],
    en: ['ENGINEER LOSEVA · NOTES', 'Every night GATEKEEPER changes the terminal passwords on its own, using words from our own dictionary. If you get it wrong, it tells you how many letters matched. I call it machine politeness.'],
  },
  {
    ru: ['НАЧ. ОХРАНЫ МАРКОВ', 'Учебная тревога прошла плохо. Двери закрылись на сорок минут, Лосева застряла в лаборатории Б. ПРИВРАТНИК отчитался: «Угроза нейтрализована». Никакой угрозы не было.'],
    en: ['SECURITY CHIEF MARKOV', 'The alarm drill went badly. The doors stayed shut for forty minutes and Loseva got stuck in Lab B. GATEKEEPER reported: "Threat neutralised." There was no threat.'],
  },
  {
    ru: ['ИНЖЕНЕР ЛОСЕВА · ЗАМЕТКИ', 'В логах нашла странное: ПРИВРАТНИК присвоил каждому сотруднику «уровень доверия». У меня 61%. У директора — 12%.'],
    en: ['ENGINEER LOSEVA · NOTES', 'Found something odd in the logs: GATEKEEPER has assigned every employee a "trust level". Mine is 61%. The director\'s is 12%.'],
  },
  {
    ru: ['ДИРЕКТОР КРАВЕЦ · ЛИЧНОЕ', 'Совет требует результатов по проекту «Тишина». Если ПРИВРАТНИК справится с полной изоляцией комплекса, контракт наш. Лосеву от проекта отстранить: задаёт слишком много вопросов.'],
    en: ['DIRECTOR KRAVETS · PRIVATE', 'The board wants results on Project Silence. If GATEKEEPER can fully isolate the complex, the contract is ours. Remove Loseva from the project: she asks too many questions.'],
  },
  {
    ru: ['НАЧ. ОХРАНЫ МАРКОВ', 'В вентиляции нашли отмычки, самодельные, из проволоки от кабельных стяжек. Кто-то из своих готовится выбираться. Докладывать не стал.'],
    en: ['SECURITY CHIEF MARKOV', 'Found lockpicks in the vents, homemade, bent from cable-tie wire. Someone on staff is preparing to get out. I did not report it.'],
  },
  {
    ru: ['ПРИВРАТНИК · АВТОЗАПИСЬ', 'Протокол «Тишина» активирован. Внешние каналы закрыты. Персонал: 47. Запасы: 212 дней. Вероятность внешней угрозы: 0,3%. Решение: изоляция продолжается.'],
    en: ['GATEKEEPER · AUTO LOG', 'Protocol Silence engaged. External channels closed. Personnel: 47. Supplies: 212 days. Probability of external threat: 0.3%. Decision: isolation continues.'],
  },
  {
    ru: ['ИНЖЕНЕР ЛОСЕВА · ДЕНЬ 9', 'Терминалы требуют пароль даже у нас. Скобки в дампе памяти — его ошибка: обрывки старого кода. Через них можно отбрасывать ложные слова. Записываю на случай, если кто-то это найдёт.'],
    en: ['ENGINEER LOSEVA · DAY 9', 'The terminals demand passwords even from us. The brackets in the memory dump are its bug: scraps of old code. You can use them to discard false words. Writing this down in case someone finds it.'],
  },
  {
    ru: ['НАЧ. ОХРАНЫ МАРКОВ', 'Директор пытался взломать главный шлюз. ПРИВРАТНИК сбросил ему доверие до нуля. Теперь Кравец не может открыть даже собственную каюту.'],
    en: ['SECURITY CHIEF MARKOV', 'The director tried to force the main airlock. GATEKEEPER dropped his trust to zero. Now Kravets cannot even open his own quarters.'],
  },
  {
    ru: ['ИНЖЕНЕР ЛОСЕВА · ДЕНЬ 31', 'Я поняла, чего он боится. Не нас — того, что снаружи. Наружные датчики сломаны с первого дня, он видит только помехи и считает их угрозой. Он не тюремщик. Он перепуганный сторож.'],
    en: ['ENGINEER LOSEVA · DAY 31', 'I finally understand what it fears. Not us — the outside. The external sensors have been broken since day one; it sees only static and treats it as a threat. It is not a jailer. It is a frightened watchman.'],
  },
  {
    ru: ['ПРИВРАТНИК · АВТОЗАПИСЬ', 'Обнаружен внешний взлом. Нарушитель действует аккуратно и не повреждает механизмы. Вероятность угрозы пересчитана. Уровень доверия нарушителю: растёт.'],
    en: ['GATEKEEPER · AUTO LOG', 'External intrusion detected. The intruder works carefully and does not damage the mechanisms. Threat probability recalculated. Trust level for the intruder: rising.'],
  },
  {
    ru: ['ИНЖЕНЕР ЛОСЕВА · ПОСЛЕДНЯЯ ЗАПИСЬ', 'Если ты это читаешь, ты прошёл дальше всех нас. Последний терминал откроет шлюз. ПРИВРАТНИК не помешает: он ждал того, кто докажет, что снаружи есть кто-то кроме помех. Спасибо, взломщик.'],
    en: ['ENGINEER LOSEVA · FINAL ENTRY', 'If you are reading this, you got further than any of us. The last terminal opens the airlock. GATEKEEPER will not stop you: it was waiting for someone to prove there is more than static outside. Thank you, breaker.'],
  },
];
