'use strict';

// Словарь паролей для взлома терминала. Слова раскладываются по длине автоматически.
const WORD_POOL = `
ЗАМОК ДВЕРЬ РАДАР ЛАМПА ПУЛЬТ ПЕСОК ВЕТЕР ПЕПЕЛ ГОРОД СТАЛЬ ТОКЕН КАНАЛ ПОРОГ ЩИТОК
РОБОТ ДРОИД МЕТКА КАРТА КРЫСА ЗАПАС ТУМАН ГРОЗА ВОЛНА ОГОНЬ ОЛОВО ТИТАН ГЕЛИЙ РАДИЙ
ЛИТИЙ МОТОР РЫЧАГ ГАЙКА ШУРУП ДРЕЛЬ МОЛОТ КЛЕЩИ ШАХТА ВЫХОД ОТСЕК КОДЕР ФОНАРЬ ПРИЁМ
БАЗАР ВОДКА ЯЩИКИ ТРУБА ВЕНТИЛЬ КОТЁЛ ПЛИТА КРЫША СТЕНА БАШНЯ ВЫШКА БАРЖА ПОЕЗД
ПРОВОД КАБЕЛЬ СИГНАЛ ВЕКТОР ФИЛЬТР ТУРЕЛЬ СЕКТОР ПАТРОН КОМПАС ПОДВАЛ ГРАНИТ БУНКЕР
РЕЛИЗ ЯКОРЬ АТЛАС ФАКЕЛ ПОРТАЛ ПРОТОН ЭКРАНЫ МОДУЛЬ ПРИВОД СЕРВЕР ПАРОЛЬ СИСТЕМА
АРХИВ ДОСТУП ДАТЧИК КЛАПАН РЕЗЕРВ СКЛАДЫ ОХРАНА ДОЗОР РАЦИЯ АНТЕННА ГЕНЕРАТОР
РЕАКТОР ТУННЕЛЬ ПРУЖИНА ПРОТОКОЛ КОНСОЛЬ ТЕРМИНАЛ ПРОЦЕССОР КОНТРОЛЬ ЛАБОРАТОРИЯ
КАРАВАН ПУСТОШЬ УБЕЖИЩЕ МУТАНТЫ ОТМЫЧКА ЦИЛИНДР ПРОВОДКА ДОЗИМЕТР СЧЁТЧИК ПРИЦЕЛЫ
РЕГИСТР КОМАНДА ПРОГРАММА МАГИСТРАЛЬ ДИСПЕТЧЕР ОПЕРАТОР ИНЖЕНЕР МЕХАНИК КОНВЕЙЕР
РЕМОНТ ДЕТАЛЬ ФОРМУЛА ЧЕРТЁЖ ПРИБОР ЗАЩИТА АТАКА БЛОКПОСТ ДЕСАНТ ВЗРЫВ ОСКОЛОК
ПРОПУСК ПЕРИМЕТР ЗАГРУЗКА ВЫГРУЗКА КОМПЛЕКС КОНТАКТ КРИСТАЛЛ МАГНИТ ПЛАЗМА ФОТОН
ЛАЗЕРЫ МАЯЧОК ТРЕВОГА СИРЕНА ПАНЕЛЬ ТАБЛО КНОПКА ТУМБЛЕР ДИСПЛЕЙ МОНИТОР КУРСОР
ВИРУСЫ ПАМЯТЬ ЧИПСЕТ ДРАЙВЕР ПЛАТЫ МАТРИЦА ВЕНТИЛЯТОР ПРОЕКТОР СКАНЕР ПРИНТЕР
ПЕРЕХОД ЛЕСТНИЦА ВОРОТА ШЛЮЗЫ КАМЕРА ПОДЪЁМ ЛИФТЫ ГАРАЖ АНГАР ПЛОЩАДЬ УЛИЦА
РАЗВЕДКА МАРШРУТ НАВИГАТОР КООРДИНАТА ПЕЛЕНГ ЧАСТОТА ЭФИРЫ ПОМЕХИ ШИФРЫ КЛЮЧИ
ДЕТЕКТОР РЕЗИСТОР ПЕРЕДАЧА ПРИЕМНИК МИКРОФОН ДИНАМИКИ НАУШНИКИ АВТОМАТЫ ВИНТОВКА ПИСТОЛЕТ
КОМАНДИР ВЕРТОЛЕТ САМОЛЕТЫ ГРУЗОВИК ТРАКТОРЫ РАДИАЦИЯ КАРАНТИН ТОРГОВЕЦ НАЕМНИКИ СТРАННИК
СКИТАЛЕЦ ДЕЗЕРТИР ЛОВУШКА ПАТРУЛЬ БАНДИТЫ ГРАНАТЫ ПОЛИГОН СТАНЦИЯ ЭКИПАЖИ
КОНСЕРВЫ ПАЁК ФЛЯГА АПТЕЧКА БИНТЫ АНТИДОТ РЮКЗАК ПАЛАТКА КОСТЁР ТОПЛИВО КАНИСТРА
`.trim().split(/\s+/).map((w) => w.replace(/Ё/g, 'Е'));

const WORD_POOL_EN = `
VAULT RADAR LASER POWER STEEL GUARD PANEL RELAY VALVE TOKEN CHAIN SHAFT TOWER RADIO ROBOT
DRONE METAL SHELL BLAST CRATE FENCE TORCH PROBE RIFLE SCRAP TOXIC STORM SMOKE FLAME CABLE
CODES NERVE ALARM SIREN MOTOR LEVER BOLTS CORES ATOMS PLATE CELLS DOORS RAIDS GHOUL RUSTY
SYSTEM BUNKER SIGNAL VECTOR FILTER TURRET SECTOR BULLET ACCESS SERVER MODULE SENSOR BREACH
CIPHER COPPER DANGER ENERGY ENGINE FUSION HACKER MATRIX MEMORY OUTPUT PLASMA POCKET RADIUM
RAIDER RESCUE ROCKET RUBBLE SHIELD SOCKET STATUS SUPPLY SWITCH TUNNEL UPLINK WASTES WIRING
LOCKER MUTANT STATIC BEACON GASKET
REACTOR CONSOLE PROGRAM NETWORK BATTERY CIRCUIT COMMAND ARCHIVE CANTEEN CAPSULE CHARGER
DEFENSE DISPLAY EMITTER FALLOUT GRENADE ISOTOPE MACHINE MONITOR NEUTRON OUTPOST PASSKEY
PATROLS PISTOLS PROCESS PROJECT QUANTUM REQUEST ROUTINE SCANNER SHELTER SILENCE STATION
SURVIVE SYSTEMS TRANSIT UNKNOWN WARHEAD WEATHER WRECKED CORRODE BLINKER
TERMINAL PROTOCOL PASSWORD OVERRIDE HOLOTAPE BACKDOOR BLACKOUT CHEMICAL COMPUTER CONTROLS
DATABASE DETECTOR ELECTRON FIREWALL HARDWARE LOCKDOWN MAGNETIC MEDICINE MILITARY MONOLITH
OPERATOR OVERSEER PLATFORM QUARTERS REACTORS RESEARCH SECURITY SENTINEL SHUTDOWN SOFTWARE
SPECIMEN SUPPLIES SURVIVOR TRANSMIT UPGRADES WARNINGS ENGINEER KEYCARDS MAINTAIN ISOLATED
`.trim().split(/\s+/);

function bucketWords(pool) {
  const out = {};
  [...new Set(pool)].forEach((w) => { (out[w.length] = out[w.length] || []).push(w); });
  return out;
}

const WORDS_BY_LEN = { ru: bucketWords(WORD_POOL), en: bucketWords(WORD_POOL_EN) };
