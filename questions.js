'use strict';

// Контрольные вопросы. ok — индекс верного варианта (одинаковый для обоих языков).
const QUESTION_TOPICS = {
  games:   { ru: 'ИГРЫ',   en: 'GAMES' },
  it:      { ru: 'IT',     en: 'IT' },
  science: { ru: 'НАУКА',  en: 'SCIENCE' },
  music:   { ru: 'МУЗЫКА', en: 'MUSIC' },
};

const QUESTIONS = [
  {
    cat: 'games', ok: 2,
    ru: { text: "Какой параметр системы S.P.E.C.I.A.L. в оригинальном Fallout сильнее всего меняет реплики героя, превращая все диалоги в мычание и глупые звуки?", opts: ["Харизма", "Удача", "Интеллект", "Восприятие"] },
    en: { text: "Which S.P.E.C.I.A.L. stat in the original Fallout changes the hero's lines the most, turning every dialogue into grunts and silly noises?", opts: ["Charisma", "Luck", "Intelligence", "Perception"] },
  },
  {
    cat: 'it', ok: 0,
    ru: { text: "В первой общедоступной спецификации языка HTML (1991 год), созданной Тимом Бернерсом-Ли, было критически мало тегов. Сколько их было изначально?", opts: ["18 тегов", "19 тегов", "20 тегов", "21 тег"] },
    en: { text: "The first public description of HTML (1991) by Tim Berners-Lee had very few tags. How many were there originally?", opts: ["18 tags", "19 tags", "20 tags", "21 tags"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Что происходит на легендарном 256-м уровне оригинальной аркадной игры Pac-Man (1980) из-за бага с переполнением 8-битного счетчика?", opts: ["Игра сбрасывается на 1-й уровень на максимальной скорости", "Правая половина экрана превращается в хаос из случайных символов", "Все призраки становятся абсолютно невидимыми", "Счетчик очков ломается и уходит в отрицательные значения"] },
    en: { text: "What happens on the legendary level 256 of the original Pac-Man arcade game (1980) because of an 8-bit counter overflow?", opts: ["The game resets to level 1 at top speed", "The right half of the screen turns into a mess of random symbols", "All the ghosts become completely invisible", "The score breaks and goes negative"] },
  },
  {
    cat: 'it', ok: 0,
    ru: { text: "Каков был объем оперативной памяти у бортового компьютера AGC, который успешно доставил астронавтов миссии Аполлон-11 на Луну в 1969 году?", opts: ["4 Килобайта", "64 Килобайта", "512 Килобайт", "4 Мегабайта"] },
    en: { text: "How much RAM did the Apollo Guidance Computer have when it took the Apollo 11 astronauts to the Moon in 1969?", opts: ["4 kilobytes", "64 kilobytes", "512 kilobytes", "4 megabytes"] },
  },
  {
    cat: 'it', ok: 2,
    ru: { text: "Какой домен был зарегистрирован самым первым в истории интернета в зоне .com?", opts: ["apple.com", "ibm.com", "symbolics.com", "microsoft.com"] },
    en: { text: "Which domain was the very first one ever registered in the .com zone?", opts: ["apple.com", "ibm.com", "symbolics.com", "microsoft.com"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Знаменитый «Код Конами» (Вверх, Вверх, Вниз, Вниз...) знают все геймеры. А какая игра была самой первой в истории, где этот чит-код появился?", opts: ["Contra (NES)", "Gradius (NES)", "Castlevania (NES)", "Silent Hill (PS1)"] },
    en: { text: "Every gamer knows the Konami Code (Up, Up, Down, Down...). In which game did this cheat code appear first?", opts: ["Contra (NES)", "Gradius (NES)", "Castlevania (NES)", "Silent Hill (PS1)"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Какая рок-группа попала в Книгу рекордов Гиннесса как единственный коллектив, сыгравший концерты на всех 7 континентах Земли (включая Антарктиду) за один год?", opts: ["Rammstein", "Metallica", "Iron Maiden", "AC/DC"] },
    en: { text: "Which rock band entered the Guinness World Records as the only act to play all 7 continents (including Antarctica) within a single year?", opts: ["Rammstein", "Metallica", "Iron Maiden", "AC/DC"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "Какая планета Солнечной системы вращается вокруг своей оси «неправильно» — по часовой стрелке, в обратную сторону от большинства остальных планет?", opts: ["Марс", "Венера", "Уран", "Нептун"] },
    en: { text: "Which planet of the Solar System spins 'the wrong way' — clockwise, opposite to most other planets?", opts: ["Mars", "Venus", "Uranus", "Neptune"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "Как называется океанический полюс недоступности — самое удаленное от любой суши место на Земле, где топят космические корабли и спутники?", opts: ["Марианская впадина", "Точка Немо", "Бермудский треугольник", "Впадина Челленджера"] },
    en: { text: "What is the name of the oceanic pole of inaccessibility — the place farthest from any land, where spacecraft and satellites are sunk?", opts: ["Mariana Trench", "Point Nemo", "Bermuda Triangle", "Challenger Deep"] },
  },
  {
    cat: 'it', ok: 1,
    ru: { text: "В протоколе HTTP существует шуточный статус-код 418, введенный 1 апреля 1998 года. Что он означает согласно официальной спецификации RFC 2324?", opts: ["Сервер перегружен запросами кофе", "Я — чайник (I'm a teapot)", "Запрашиваемый ресурс улетел на Луну", "Устройство не поддерживает Wi-Fi связь"] },
    en: { text: "HTTP has a joke status code 418, introduced on April 1, 1998. What does it mean according to RFC 2324?", opts: ["The server is overloaded with coffee requests", "I'm a teapot", "The requested resource flew to the Moon", "The device does not support Wi-Fi"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Какая валюта, помимо бутылочных крышек, имеет официальное и стабильное хождение на территории Мохаве в игре Fallout: New Vegas?", opts: ["Золотые слитки довоенного ЦБ", "Доллары НКР и Динарии Легиона", "Пластиковые фишки казино Стрипа", "Торговые сертификаты Хаба"] },
    en: { text: "Besides bottle caps, which currencies officially circulate in the Mojave in Fallout: New Vegas?", opts: ["Pre-war central bank gold bars", "NCR dollars and Legion denarii", "Strip casino plastic chips", "Hub trade certificates"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Какой культовый рок-альбом продержался в топ-200 американского чарта Billboard рекордные 741 неделю непрерывно (суммарно более 15 лет)?", opts: ["Led Zeppelin — Led Zeppelin IV", "Pink Floyd — The Dark Side of the Moon", "Nirvana — Nevermind", "AC/DC — Back in Black"] },
    en: { text: "Which classic rock album stayed on the US Billboard 200 for a record 741 weeks (over 15 years in total)?", opts: ["Led Zeppelin — Led Zeppelin IV", "Pink Floyd — The Dark Side of the Moon", "Nirvana — Nevermind", "AC/DC — Back in Black"] },
  },
  {
    cat: 'it', ok: 2,
    ru: { text: "Из какого материала был выполнен корпус самого первого рабочего прототипа компьютерной мыши, созданного Дугласом Энгельбартом в 1964 году?", opts: ["Прессованный пластик", "Литой алюминий", "Натуральное дерево", "Листовой бакелит"] },
    en: { text: "What was the case of the very first computer mouse prototype, built by Douglas Engelbart in 1964, made of?", opts: ["Molded plastic", "Cast aluminium", "Wood", "Sheet bakelite"] },
  },
  {
    cat: 'games', ok: 0,
    ru: { text: "На каком советском компьютере в 1984 году программист Алексей Пажитнов написал самую первую, текстовую версию легендарной игры «Тетрис»?", opts: ["Электроника-60", "БЭСМ-6", "Агат-9", "БК-0010"] },
    en: { text: "On which Soviet computer did Alexey Pajitnov write the very first, text-mode version of Tetris in 1984?", opts: ["Elektronika-60", "BESM-6", "Agat-9", "BK-0010"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "На борту аппаратов «Вояджер-1» и «Вояджер-2» находятся знаменитые пластины с посланием человечества. Из какого материала сделаны диски на самом деле?", opts: ["Чистое золото 999 пробы", "Позолоченная медь", "Сверхпрочный титановый сплав", "Анодированный космический алюминий"] },
    en: { text: "Voyager 1 and Voyager 2 carry the famous records with a message from humanity. What are the discs actually made of?", opts: ["Pure 24-carat gold", "Gold-plated copper", "Ultra-strong titanium alloy", "Anodized aerospace aluminium"] },
  },
  {
    cat: 'it', ok: 1,
    ru: { text: "В честь чего (или кого) голландский программист Гвидо ван Россум назвал созданный им в 1991 году популярнейший язык Python?", opts: ["В честь гигантского сетчатого питона своего соседа", "В честь британского комедийного шоу «Монти Пайтон»", "Это аббревиатура базовых системных директив", "В честь древнегреческого мифического змея Пифона"] },
    en: { text: "What (or whom) did the Dutch programmer Guido van Rossum name the Python language after in 1991?", opts: ["His neighbour's giant reticulated python", "The British comedy show Monty Python", "It's an acronym of basic system directives", "The mythical Greek serpent Python"] },
  },
  {
    cat: 'games', ok: 3,
    ru: { text: "Маркус Перссон (Notch) изначально планировал назвать будущий мировой хит Minecraft совсем по-другому. Какое рабочее название носила игра на первой неделе разработки?", opts: ["Block World", "Craft & Build", "Dig Deep", "Cave Game"] },
    en: { text: "Markus Persson (Notch) originally planned a different name for Minecraft. What was its working title during the first week of development?", opts: ["Block World", "Craft & Build", "Dig Deep", "Cave Game"] },
  },
  {
    cat: 'music', ok: 0,
    ru: { text: "Какое музыкальное видео вошло в историю, став самым первым клипом, запущенным в эфир телеканала MTV в момент начала его вещания 1 августа 1981 года?", opts: ["The Buggles — Video Killed the Radio Star", "Queen — Bohemian Rhapsody", "Michael Jackson — Billie Jean", "Dire Straits — Money for Nothing"] },
    en: { text: "Which music video went down in history as the very first one aired on MTV when it launched on August 1, 1981?", opts: ["The Buggles — Video Killed the Radio Star", "Queen — Bohemian Rhapsody", "Michael Jackson — Billie Jean", "Dire Straits — Money for Nothing"] },
  },
  {
    cat: 'science', ok: 2,
    ru: { text: "Какова глубина Кольской сверхглубокой скважины (СГ-3) — самого глубокого рукотворного проникновения человека в земную кору?", opts: ["8 848 метров", "10 994 метра", "12 262 метра", "15 500 метров"] },
    en: { text: "How deep is the Kola Superdeep Borehole (SG-3) — the deepest artificial hole ever drilled into the Earth's crust?", opts: ["8,848 metres", "10,994 metres", "12,262 metres", "15,500 metres"] },
  },
  {
    cat: 'it', ok: 1,
    ru: { text: "В 1947 году ученые Гарварда извлекли из реле компьютера Mark II настоящую моль, породив термин «баг». Кто был ведущим программистом, зафиксировавшим этот случай?", opts: ["Алан Тьюринг", "Грейс Хоппер", "Ада Лавлейс", "Джон фон Нейман"] },
    en: { text: "In 1947 Harvard engineers pulled a real moth out of a Mark II relay, giving rise to the term 'bug'. Which lead programmer recorded the event?", opts: ["Alan Turing", "Grace Hopper", "Ada Lovelace", "John von Neumann"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "В культовой игре Half-Life (1998) инцидент в научно-исследовательском комплексе «Чёрная Меза» разрушил барьер между мирами. Как официально назывался этот физический сдвиг?", opts: ["Квантовое расщепление ядра", "Каскадный резонанс (Cascade Resonance)", "Сингулярный коллапс фазы", "Сжатие антиматерии"] },
    en: { text: "In Half-Life (1998) an incident at the Black Mesa Research Facility broke the barrier between worlds. What is the official name of that event?", opts: ["Quantum core fission", "Resonance Cascade", "Singular phase collapse", "Antimatter compression"] },
  },
  {
    cat: 'it', ok: 2,
    ru: { text: "Из чего на самом деле состоит знаменитый падающий зеленый «цифровой дождь» на мониторах операторов в трилогии фильмов «Матрица»?", opts: ["Строки измененного компилятором кода на C++", "Уравнения квантовой хромодинамики", "Перемешанные символы японских рецептов суши", "Фрагменты зашифрованных логов Unix-серверов"] },
    en: { text: "What is the famous green falling 'digital rain' on the operators' monitors in The Matrix actually made of?", opts: ["Lines of C++ code mangled by a compiler", "Quantum chromodynamics equations", "Scrambled characters from Japanese sushi recipes", "Fragments of encrypted Unix server logs"] },
  },
  {
    cat: 'it', ok: 2,
    ru: { text: "Как официально и дословно расшифровывается аббревиатура технологии беспроводной передачи данных Wi-Fi?", opts: ["Wireless Fidelity", "Wave Frequency Internet", "Никак (это просто придуманный маркетологами бренд)", "Wide Field Interface"] },
    en: { text: "What does the wireless technology name Wi-Fi officially stand for?", opts: ["Wireless Fidelity", "Wave Frequency Internet", "Nothing — it's just a brand invented by marketers", "Wide Field Interface"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Как расшифровывается имя коварного искусственного интеллекта GLaDOS из серии головоломок Portal от компании Valve?", opts: ["Global Laboratory and Digital Operating System", "Genetic Lifeform and Disk Operating System", "General Laser and Defense Online System", "Government Logic and Data Operation Software"] },
    en: { text: "What does the name of the treacherous AI GLaDOS from Valve's Portal series stand for?", opts: ["Global Laboratory and Digital Operating System", "Genetic Lifeform and Disk Operating System", "General Laser and Defense Online System", "Government Logic and Data Operation Software"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "В каком году вышла самая первая часть серии Fallout?", opts: ["1995", "1997", "1999", "2001"] },
    en: { text: "In which year was the very first Fallout game released?", opts: ["1995", "1997", "1999", "2001"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Какая компания выпустила оригинальный Fallout?", opts: ["Bethesda Softworks", "Interplay", "BioWare", "Blizzard"] },
    en: { text: "Which company published the original Fallout?", opts: ["Bethesda Softworks", "Interplay", "BioWare", "Blizzard"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "В окрестностях какого города разворачивается действие Fallout 3?", opts: ["Бостон", "Вашингтон", "Лас-Вегас", "Нью-Йорк"] },
    en: { text: "Around which city does Fallout 3 take place?", opts: ["Boston", "Washington, D.C.", "Las Vegas", "New York"] },
  },
  {
    cat: 'games', ok: 0,
    ru: { text: "Под каким именем впервые появился Марио в аркаде Donkey Kong (1981)?", opts: ["Jumpman", "Mr. Video", "Plumber", "Hammer Man"] },
    en: { text: "Under what name did Mario first appear in the Donkey Kong arcade game (1981)?", opts: ["Jumpman", "Mr. Video", "Plumber", "Hammer Man"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Из скольких квадратов состоит каждая фигура в «Тетрисе»?", opts: ["3", "4", "5", "6"] },
    en: { text: "How many squares does every Tetris piece consist of?", opts: ["3", "4", "5", "6"] },
  },
  {
    cat: 'games', ok: 0,
    ru: { text: "Какая компания выпустила аркадный автомат Pong в 1972 году?", opts: ["Atari", "Nintendo", "Sega", "Taito"] },
    en: { text: "Which company released the Pong arcade cabinet in 1972?", opts: ["Atari", "Nintendo", "Sega", "Taito"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Какое оружие стало визитной карточкой Гордона Фримена в Half-Life?", opts: ["Гаечный ключ", "Монтировка", "Бейсбольная бита", "Лопата"] },
    en: { text: "Which weapon became Gordon Freeman's trademark in Half-Life?", opts: ["Wrench", "Crowbar", "Baseball bat", "Shovel"] },
  },
  {
    cat: 'games', ok: 0,
    ru: { text: "Кто автор книг, по которым сделана серия игр «Ведьмак»?", opts: ["Анджей Сапковский", "Станислав Лем", "Дмитрий Глуховский", "Терри Пратчетт"] },
    en: { text: "Who wrote the books The Witcher game series is based on?", opts: ["Andrzej Sapkowski", "Stanisław Lem", "Dmitry Glukhovsky", "Terry Pratchett"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Какая игра 1980 года дала название целому жанру с процедурными подземельями и «вечной» смертью?", opts: ["Zork", "Rogue", "Nethack", "Diablo"] },
    en: { text: "Which 1980 game gave its name to a whole genre of procedural dungeons and permanent death?", opts: ["Zork", "Rogue", "Nethack", "Diablo"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Какой моб в Minecraft бесшумно подкрадывается к игроку и взрывается?", opts: ["Эндермен", "Крипер", "Скелет", "Гаст"] },
    en: { text: "Which Minecraft mob silently sneaks up on the player and explodes?", opts: ["Enderman", "Creeper", "Skeleton", "Ghast"] },
  },
  {
    cat: 'games', ok: 1,
    ru: { text: "Какая студия создала Doom (1993)?", opts: ["Epic MegaGames", "id Software", "Apogee", "Valve"] },
    en: { text: "Which studio made Doom (1993)?", opts: ["Epic MegaGames", "id Software", "Apogee", "Valve"] },
  },
  {
    cat: 'games', ok: 3,
    ru: { text: "Какой расы НЕТ в оригинальном StarCraft?", opts: ["Зерги", "Протоссы", "Терраны", "Орки"] },
    en: { text: "Which race is NOT in the original StarCraft?", opts: ["Zerg", "Protoss", "Terrans", "Orcs"] },
  },
  {
    cat: 'games', ok: 0,
    ru: { text: "Как называется вымышленная корпорация, построившая убежища в серии Fallout?", opts: ["Vault-Tec", "RobCo", "Umbrella", "Aperture Science"] },
    en: { text: "What is the fictional corporation that built the vaults in the Fallout series called?", opts: ["Vault-Tec", "RobCo", "Umbrella", "Aperture Science"] },
  },
  {
    cat: 'games', ok: 0,
    ru: { text: "Какая консоль Sony вышла первой?", opts: ["PlayStation", "PSP", "PlayStation 2", "PS Vita"] },
    en: { text: "Which Sony console came out first?", opts: ["PlayStation", "PSP", "PlayStation 2", "PS Vita"] },
  },
  {
    cat: 'it', ok: 1,
    ru: { text: "Кого часто называют первым программистом в истории за алгоритм для аналитической машины Бэббиджа?", opts: ["Грейс Хоппер", "Ада Лавлейс", "Алан Тьюринг", "Чарльз Бэббидж"] },
    en: { text: "Who is often called the first programmer in history for an algorithm for Babbage's Analytical Engine?", opts: ["Grace Hopper", "Ada Lovelace", "Alan Turing", "Charles Babbage"] },
  },
  {
    cat: 'it', ok: 3,
    ru: { text: "Сколько различных значений можно закодировать одним байтом?", opts: ["8", "128", "255", "256"] },
    en: { text: "How many different values can one byte encode?", opts: ["8", "128", "255", "256"] },
  },
  {
    cat: 'it', ok: 0,
    ru: { text: "Как расшифровывается HTTP?", opts: ["HyperText Transfer Protocol", "High Transfer Text Process", "Host Terminal Transfer Protocol", "HyperText Terminal Program"] },
    en: { text: "What does HTTP stand for?", opts: ["HyperText Transfer Protocol", "High Transfer Text Process", "Host Terminal Transfer Protocol", "HyperText Terminal Program"] },
  },
  {
    cat: 'it', ok: 1,
    ru: { text: "Кто создал ядро Linux в 1991 году?", opts: ["Ричард Столлман", "Линус Торвальдс", "Деннис Ритчи", "Кен Томпсон"] },
    en: { text: "Who created the Linux kernel in 1991?", opts: ["Richard Stallman", "Linus Torvalds", "Dennis Ritchie", "Ken Thompson"] },
  },
  {
    cat: 'it', ok: 2,
    ru: { text: "Какой язык Брендан Эйх создал примерно за 10 дней в 1995 году?", opts: ["Java", "PHP", "JavaScript", "Ruby"] },
    en: { text: "Which language did Brendan Eich create in about 10 days in 1995?", opts: ["Java", "PHP", "JavaScript", "Ruby"] },
  },
  {
    cat: 'it', ok: 0,
    ru: { text: "Как называлась сеть-предшественница интернета, запущенная в 1969 году?", opts: ["ARPANET", "FIDONET", "USENET", "BITNET"] },
    en: { text: "What was the predecessor network of the internet, launched in 1969, called?", opts: ["ARPANET", "FIDONET", "USENET", "BITNET"] },
  },
  {
    cat: 'it', ok: 2,
    ru: { text: "Какое десятичное число записывается в двоичной системе как 1010?", opts: ["5", "8", "10", "12"] },
    en: { text: "Which decimal number is written as 1010 in binary?", opts: ["5", "8", "10", "12"] },
  },
  {
    cat: 'it', ok: 1,
    ru: { text: "Кто основал Microsoft вместе с Биллом Гейтсом?", opts: ["Стив Возняк", "Пол Аллен", "Стив Балмер", "Гордон Мур"] },
    en: { text: "Who founded Microsoft together with Bill Gates?", opts: ["Steve Wozniak", "Paul Allen", "Steve Ballmer", "Gordon Moore"] },
  },
  {
    cat: 'it', ok: 2,
    ru: { text: "Что означает HTTP-код ответа 404?", opts: ["Доступ запрещён", "Внутренняя ошибка сервера", "Ресурс не найден", "Ресурс перемещён"] },
    en: { text: "What does the HTTP response code 404 mean?", opts: ["Access forbidden", "Internal server error", "Resource not found", "Resource moved"] },
  },
  {
    cat: 'it', ok: 0,
    ru: { text: "Кто написал первую версию системы контроля версий Git в 2005 году?", opts: ["Линус Торвальдс", "Гвидо ван Россум", "Джон Кармак", "Билл Джой"] },
    en: { text: "Who wrote the first version of the Git version control system in 2005?", opts: ["Linus Torvalds", "Guido van Rossum", "John Carmack", "Bill Joy"] },
  },
  {
    cat: 'it', ok: 0,
    ru: { text: "Как расшифровывается CPU?", opts: ["Central Processing Unit", "Computer Power Unit", "Core Program Utility", "Central Program Unit"] },
    en: { text: "What does CPU stand for?", opts: ["Central Processing Unit", "Computer Power Unit", "Core Program Utility", "Central Program Unit"] },
  },
  {
    cat: 'it', ok: 1,
    ru: { text: "В каком году была основана компания Google?", opts: ["1994", "1998", "2001", "2004"] },
    en: { text: "In which year was Google founded?", opts: ["1994", "1998", "2001", "2004"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "Какой химический символ у золота?", opts: ["Ag", "Au", "Go", "Gd"] },
    en: { text: "What is the chemical symbol for gold?", opts: ["Ag", "Au", "Go", "Gd"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "Какова примерная скорость света в вакууме?", opts: ["30 000 км/с", "300 000 км/с", "3 000 000 км/с", "150 000 км/с"] },
    en: { text: "What is the approximate speed of light in a vacuum?", opts: ["30,000 km/s", "300,000 km/s", "3,000,000 km/s", "150,000 km/s"] },
  },
  {
    cat: 'science', ok: 2,
    ru: { text: "Какая планета Солнечной системы самая большая?", opts: ["Сатурн", "Нептун", "Юпитер", "Уран"] },
    en: { text: "Which planet of the Solar System is the largest?", opts: ["Saturn", "Neptune", "Jupiter", "Uranus"] },
  },
  {
    cat: 'science', ok: 2,
    ru: { text: "Какой химический элемент самый лёгкий?", opts: ["Гелий", "Литий", "Водород", "Углерод"] },
    en: { text: "Which chemical element is the lightest?", opts: ["Helium", "Lithium", "Hydrogen", "Carbon"] },
  },
  {
    cat: 'science', ok: 2,
    ru: { text: "Сколько хромосом в соматической клетке человека?", opts: ["23", "44", "46", "48"] },
    en: { text: "How many chromosomes are in a human somatic cell?", opts: ["23", "44", "46", "48"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "Кто открыл явление радиоактивности в 1896 году?", opts: ["Мария Кюри", "Анри Беккерель", "Эрнест Резерфорд", "Вильгельм Рентген"] },
    en: { text: "Who discovered radioactivity in 1896?", opts: ["Marie Curie", "Henri Becquerel", "Ernest Rutherford", "Wilhelm Röntgen"] },
  },
  {
    cat: 'science', ok: 3,
    ru: { text: "В каких единицах измеряется сила электрического тока?", opts: ["Вольт", "Ом", "Ватт", "Ампер"] },
    en: { text: "What unit is electric current measured in?", opts: ["Volt", "Ohm", "Watt", "Ampere"] },
  },
  {
    cat: 'science', ok: 2,
    ru: { text: "При какой температуре по Фаренгейту кипит вода при нормальном давлении?", opts: ["100 °F", "180 °F", "212 °F", "273 °F"] },
    en: { text: "At what temperature in Fahrenheit does water boil at normal pressure?", opts: ["100 °F", "180 °F", "212 °F", "273 °F"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "Какая звезда ближе всего к Солнцу?", opts: ["Сириус", "Проксима Центавра", "Бетельгейзе", "Вега"] },
    en: { text: "Which star is the closest to the Sun?", opts: ["Sirius", "Proxima Centauri", "Betelgeuse", "Vega"] },
  },
  {
    cat: 'science', ok: 2,
    ru: { text: "Какой газ преобладает в атмосфере Земли?", opts: ["Кислород", "Углекислый газ", "Азот", "Аргон"] },
    en: { text: "Which gas makes up most of Earth's atmosphere?", opts: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "В каком году был запущен первый искусственный спутник Земли?", opts: ["1949", "1957", "1961", "1965"] },
    en: { text: "In which year was the first artificial Earth satellite launched?", opts: ["1949", "1957", "1961", "1965"] },
  },
  {
    cat: 'science', ok: 1,
    ru: { text: "Кто первым в истории вышел в открытый космос?", opts: ["Юрий Гагарин", "Алексей Леонов", "Нил Армстронг", "Герман Титов"] },
    en: { text: "Who was the first person ever to walk in open space?", opts: ["Yuri Gagarin", "Alexei Leonov", "Neil Armstrong", "Gherman Titov"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Из какой страны группа Rammstein?", opts: ["Австрия", "Германия", "Швейцария", "Нидерланды"] },
    en: { text: "Which country is Rammstein from?", opts: ["Austria", "Germany", "Switzerland", "Netherlands"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Кто был вокалистом группы Queen?", opts: ["Роберт Плант", "Фредди Меркьюри", "Мик Джаггер", "Дэвид Боуи"] },
    en: { text: "Who was the lead singer of Queen?", opts: ["Robert Plant", "Freddie Mercury", "Mick Jagger", "David Bowie"] },
  },
  {
    cat: 'music', ok: 2,
    ru: { text: "Из какого города родом The Beatles?", opts: ["Лондон", "Манчестер", "Ливерпуль", "Бирмингем"] },
    en: { text: "Which city are The Beatles from?", opts: ["London", "Manchester", "Liverpool", "Birmingham"] },
  },
  {
    cat: 'music', ok: 2,
    ru: { text: "На каком альбоме Pink Floyd вышла песня Another Brick in the Wall?", opts: ["Animals", "Wish You Were Here", "The Wall", "Meddle"] },
    en: { text: "Which Pink Floyd album features Another Brick in the Wall?", opts: ["Animals", "Wish You Were Here", "The Wall", "Meddle"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Какая группа записала Smells Like Teen Spirit?", opts: ["Pearl Jam", "Nirvana", "Soundgarden", "Alice in Chains"] },
    en: { text: "Which band recorded Smells Like Teen Spirit?", opts: ["Pearl Jam", "Nirvana", "Soundgarden", "Alice in Chains"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Кто был лидером группы «Кино»?", opts: ["Борис Гребенщиков", "Виктор Цой", "Юрий Шевчук", "Константин Кинчев"] },
    en: { text: "Who was the frontman of the Soviet band Kino?", opts: ["Boris Grebenshchikov", "Viktor Tsoi", "Yuri Shevchuk", "Konstantin Kinchev"] },
  },
  {
    cat: 'music', ok: 0,
    ru: { text: "Сколько струн у стандартной бас-гитары?", opts: ["4", "5", "6", "7"] },
    en: { text: "How many strings does a standard bass guitar have?", opts: ["4", "5", "6", "7"] },
  },
  {
    cat: 'music', ok: 2,
    ru: { text: "На каком инструменте играл Ринго Старр в The Beatles?", opts: ["Бас-гитара", "Клавишные", "Ударные", "Ритм-гитара"] },
    en: { text: "Which instrument did Ringo Starr play in The Beatles?", opts: ["Bass guitar", "Keyboards", "Drums", "Rhythm guitar"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Как называется дебютный альбом Metallica 1983 года?", opts: ["Ride the Lightning", "Kill 'Em All", "Master of Puppets", "…And Justice for All"] },
    en: { text: "What is the title of Metallica's 1983 debut album?", opts: ["Ride the Lightning", "Kill 'Em All", "Master of Puppets", "…And Justice for All"] },
  },
  {
    cat: 'music', ok: 1,
    ru: { text: "Какая песня Deep Purple рассказывает о пожаре в казино Монтрё?", opts: ["Highway Star", "Smoke on the Water", "Child in Time", "Burn"] },
    en: { text: "Which Deep Purple song tells about a fire at the Montreux casino?", opts: ["Highway Star", "Smoke on the Water", "Child in Time", "Burn"] },
  },
];
