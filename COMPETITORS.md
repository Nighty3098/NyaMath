# Обзор топовых инженерных программ для расчётов: плюсы, минусы + где мы

> Дата: 22.09.2026. Цель: зафиксировать, чем сильны/слабы лидеры рынка, что из этого уже есть в NyaMath, а чего не хватает.
> Метод: веб-поиск (G2/Capterra/Trustpilot, Reddit r/engineering r/matlab r/math, PTC Community, SMath Forum, Maplesoft/Wolfram/MathWorks-доки, сравнения IndustrialMonitor/EAC) + сверка с кодом `src/` и `mcp/`.
> Связанные файлы: `DOC.md` — полный ресёрч 19.09.2026 (18+ позиций с техпометками), `DESIGN.md` — разбор дизайна/UX 20.09.2026. Этот файл — короткая выжимка + честный статус.

---

## 0. Сводная таблица

| Программа                                       | Ниша                             | Лицензия/цена (2026)                                  | Главный плюс                                                                                                          | Главная боль                                                                                            |
| ----------------------------------------------- | -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| PTC Mathcad Prime 12                            | «Лист = отчёт», эталон           | Подписка ~£3k/год/seat, Express-free с вотермаркой    | Нотация как в учебнике (`:=`, `=`, юниты в строке), документ = отчёт, Solve Blocks, Excel/Creo/Windchill              | Цена + license.dat, миграция 15→Prime ломает листы, тормоза на больших листах, бедные плоты             |
| SMath Studio 1.x                                | Бесплатный клон Mathcad 15       | Free personal, ~2 МБ, portable                        | Лёгкий, paper-like, Dynamic Assistant + autocomplete, 40+ языков, форум с автором                                     | UI «из 2008», Mono-костыль на Linux/Mac, плагинный ад без lockfile, нет коллаба/Python                  |
| Calcpad / CalcpadCE (fork 03.2026)              | Код → красивый HTML-отчёт        | Free, desktop .NET + cloud IDE                        | Подстановка значений (`F = m·a = 10 N`), `?` → форма ввода для заказчика, экспорт в Word, библиотека балки/ЖБ         | Code-DSL вместо WYSIWYG, numeric-only без сильного CAS, нет тем, web-viewer read-only                   |
| Maple Flow (+ классический Maple)               | Свободный canvas на движке Maple | Дорого (≈ Mathcad), perpetual или sub, Win+Mac        | Сильнейший символьный движок, свободное позиционирование, AI Formula Assistant, фазоры, кодогенерация C/Python/MATLAB | Цена, Flow беднее классики по пакетам, Ribbon-ворчание, Trustpilot 2.3 за краши/порчу файлов            |
| Wolfram Mathematica / Alpha                     | «Всё в одном» CAS                | x2–5 от конкурентов, cloud по подписке, upload-лимиты | 7000 функций, символьное+численное+ML+гео+Knowledgebase, лучший Help, Manipulate                                      | Кривая WL-языка, no-autosave (теряли часы), тяжёлый старт, проприетарность                              |
| MATLAB + Live Editor + Simulink                 | Численная среда №1               | $940+/год + тулбоксы ×$2000                           | Тулбоксы под всё, отладчик, плоты одной строкой, Simulink, курсы/поддержка                                            | Подписка вместо perpetual, black-box солверы, 1-индекс, тяжёлая установка, Live Editor тормозит         |
| GNU Octave / Scilab+Xcos                        | Бесплатные MATLAB-клоны          | GPL/free                                              | Octave ~95% синтаксиса `.m`, Scilab IDE из коробки + Xcos как бесплатный Simulink, `mfile2sci`                        | Нет тулбоксов/Simulink-паритета, плоты проще, диалекты (`%pi`, `xgrid`), perf ниже MKL                  |
| Julia + Pluto.jl                                | Быстрый научный стек             | MIT/free                                              | Скорость C + удобство Python, реактивный DAG без hidden state, `.jl` git-friendly, `@bind`-слайдеры                   | TTFP (JIT-прогрев), правило «переменная — один раз», сырая экосистема, фрагментация Quarto/Pluto/Bonito |
| Jupyter / Colab / Kaggle                        | Notebook-стандарт                | Free tiers (Colab 12h/12GB, GPU не гарантирован)      | Zero-setup в браузере, 40+ ядер, Markdown+код+картинки, nbconvert, шаринг как Google Docs                             | Hidden state (только ~4% воспроизводимы), таймауты/стирание файлов, `pip`-ад, нечитаемые git-диффы      |
| Desmos Studio                                   | Граф-калькулятор №1              | Free                                                  | Zero-friction старт, слайдеры, цвета/анимации, офлайн на телефоне, клавиатура `π √ ≤`, Projector Mode                 | Не CAS, нет units/документов-отчётов/матриц/ODE/программ — «игрушечный» для вуза                        |
| GeoGebra                                        | Школьный всё-в-одном             | Free                                                  | Геометрия+алгебра+CAS+статистика+3D, drag-and-drop, 80+ языков, LMS                                                   | 6 приложений вместо одного путают, сложный онбординг, CAS слабее Maple, баги сохранений                 |
| Symbolab / Photomath / MS Solver / Mathway / WA | «Домашка за 5 сек»               | Freemium (шаги $2–10/мес; MS Solver free)             | Step-by-step + камера-ввод + Problem Generator, графинг вместо TI-84                                                  | Шаги за paywall, скипы логики, редизайны клавиатур, читинг-морализм, сбор данных/ads                    |
| OriginPro / LabPlot / SciDAVis                  | Плоты для статей                 | Дорого (Origin), LabPlot free                         | Publication-quality в 2 клика, 100+ типов, multi-axis/panel, fitting/ANOVA, batch без кода                            | Кривая обучения, стиль «из 90-х», только Windows полноценно, `.opj` через Viewer                        |
| HiPER Calc / Numbat / Soulver                   | Карманные                        | Free+ads / open-source                                | 100 знаков, SI-префиксы, history-лента, Numbat-units в терминале, Soulver «пишешь словами»                            | Ads + consent 500+ партнёров (HiPER), только «одна строка», нет графиков/матриц/ODE                     |
| CalcTree / fxSolver                             | Новые web                        | Cloud-sub (free-tier обрезан)                         | CalcTree: realtime-коллаба + версионность + AI по стандартам; fxSolver: тысячи готовых формул «вбил → Solve»          | Cloud-only без offline, vendor lock-in, «слишком много AI-магии», у fxSolver устаревший UI без units    |
| Maxima / SageMath+CoCalc                        | Open-source CAS                  | GPL/free                                              | Maxima — лучший free CAS (Laplace/ODE/ряды), Sage — «бесплатный Mathematica на Python-клее», CoCalc TimeTravel        | Сборка «дни фиксов», DX 90-х, Sage тяжёлый (ГБ зависимостей), CoCalc free тормозит                      |

---

## 1. Плюсы топов (что хвалят — с опорой на отзывы)

1. **PTC Mathcad Prime / 15** — живая нотация `:=`/`=`, units intelligence (`m+kg` нельзя, `N·m ↔ lbf·ft` автоматом), документ = отчёт (текст+формулы+графики+картинки, PDF), Solve Blocks + root/ODE/PDE, Excel-двусторонний + Creo/Windchill + API, с Prime 10–11 — Advanced Controls (slider/listbox/checkbox) + Python вместо VBScript, Calculate Now для больших листов.
2. **SMath Studio** — «Mathcad 15, но бесплатно и 2 МБ», Dynamic Assistant + autocomplete (самая хвалимая фича), significant digits, подсветка переменной по листу, плагины (X-Y Plot, WaterSteamPro/CoolProp, импорт `.mcd/.xmcd`), 43 языка, форум с автором.
3. **Calcpad** — HTML-отчёт с подстановкой значений (идеален для экспертизы), `?` → форма ввода, экспорт Word через MathType, картинки/таблицы в комментариях, библиотека worksheets (балки, колонны), CalcpadCE — realtime-рендер + FEA-демо.
4. **Maple Flow / Maple** — свободный canvas-«салфетка», топовый символьный движок (~5000 функций, можно без численных значений), AI Formula Assistant, Variables palette, TOC автосборка, фазоры `|Z|∠φ`, кодогенерация, запуск листа как функции из Excel/API.
5. **Mathematica** — символьное+численное+ML+гео+Knowledgebase, notebook + Manipulate-слайдеры, Help лучший на рынке, home-лицензия, GPU/параллелизм.
6. **MATLAB** — тулбоксы под всё, отладчик, плоты одной строкой, Simulink, курсы и быстрая поддержка, интеграция Python/C++.
7. **Octave/Scilab** — совместимость `.m`/`.mat`, IDE из коробки (редактор, variable browser, help с примерами), Xcos, `mfile2sci`-мост миграции, FOSS для НИИ.
8. **Julia+Pluto** — скорость C, реактивность «как spreadsheet» без hidden state, `.jl` git-friendly с пиннингом версий, Handcalcs-подстановки.
9. **Jupyter/Colab** — zero-setup + free GPU/TPU, шаринг с комментариями, Drive/GitHub, preinstalled TF/PyTorch, 40+ ядер, nbconvert.
10. **Desmos** — старт за секунды, слайдеры, регрессии/таблицы/parametric, клавиатура, projector mode, accessibility-озвучка графика.
11. **GeoGebra** — 5 видов (Algebra+Graphics+CAS+Spreadsheet+3D), tube-шеринг, точный CAS-расклад.
12. **Symbolab/Photomath** — 500+ калькуляторов с шагами, камера-ввод, Problem Generator, MS Solver полностью free.
13. **Origin/LabPlot** — плоты для статей в 2 клика, multi-panel/axis, fitting/Stats, EMF без артефактов, Viewer для шеринга.
14. **HiPER/Numbat/Soulver** — точность, SI-префиксы, hex/bin, матрицы на планшете, units в терминале, «блокнот словами».
15. **CalcTree/fxSolver** — realtime-коллаба + версионность + AI-ревью по нормам, Markdown import/export, библиотека формул со связкой переменных.

## 2. Минусы топов (за что ругают)

1. **Prime** — подписка и license.dat/MAC-привязка, Express-тыква с вотермаркой после триала, миграция 15→Prime «апгрейд-даунгрейд» (конвертер сыплет ошибками), 10MB `READTEXT` 5 мин, сабскрипты в 2 клика, нельзя парковать палитры, бедные плоты → уносят в Excel.
2. **SMath** — жёлтый фон и WinForms/Mono «Windows в костюме», нет dark theme, мелкие палитры, Single Instance лечится только `settings.inf`, плагины без lockfile, scalar-баги `augment/stack`, RU-origin баны в enterprise IT, нет ARM/macOS-натива.
3. **Calcpad** — code-DSL порог для mathcad-привыкших, кавычки путают, numeric-only, нет тем, только Win 10/11 + .NET 10, viewer read-only, раскол комьюнити после закрытия исходников 03.2026.
4. **Flow/Maple** — цена, Flow беднее классики, мигратор `.xmcd` не идеален, Ribbon-жалобы, краши/порча файлов и неработающий interrupt (ядро без cancel).
5. **Mathematica** — цена x2–5, WL-синтаксис `[[ ]] @ /@` пугает, no-autosave, медленные большие данные, chicken-egg с вузами, standalone/Docker-боль.
6. **MATLAB** — base+toolbox-модель, black-box солверы, air-gap license server боль, 1-индекс и медленные циклы, Live Scripts тяжелы для git, установка гигабайты; Live Editor — «скролл как на iPad», Chromium-регрессии 2025.
7. **Octave/Scilab** — нет Simulink/DL-тулбоксов, плоты проще, edge-несовместимость классов, диалекты (`%pi`), гриды 1024² упираются.
8. **Julia/Pluto** — TTFP секунды/десятки секунд, single-assignment ломает императивный стиль, `Distributed`/`@async` не реактивны, Binder spin-up 6–7 мин, breaking между минорами.
9. **Jupyter/Colab** — hidden state (`In[17]→In[15]`), 12h/12GB лимиты, файлы трутся, переустановка пакетов каждую сессию, `requirements` нет в 70% репо, `.ipynb`-диффы нечитаемы, confidential нельзя без enterprise.
10. **Desmos/GeoGebra** — Desmos не CAS без units/отчётов; GeoGebra «хозяйственный магазин ради одной картины», 6 приложений путают, Input Help не находят, ошибки без хинтов, iPad-login баги.
11. **Symbolab/Photomath** — ответ free, шаги за Pro; скипы логики, «месиво» на векторах, редизайн клавиатуры 2021, нет preview до оплаты, отмена через текстовую страницу, privacy/ads.
12. **Origin** — дорого без гранта, «Not User-Friendly», LabTalk слабее Python, fitting без exact form, только Windows.
13. **HiPER** — ads + 500 consent-партнёров → «instant removal», попапы даже в Pro, раскладка меняется без спроса, `double`-пределы.
14. **CalcTree** — AI-кап во free, данные в облаке, team-цена, нет offline, «хочу deterministic расчёт для экспертизы, а не магию».
15. **Maxima/Sage** — слабый simplify, asksign-вопросы, сборка из исходников «дни», gnuplot через файлы, дока 800 стр. без картинок; Sage — ГБ зависимостей, free CoCalc троттлит.

---

## 3. Что у нас УЖЕ реализовано (честно по коду, `nyamath 0.0.0`, движок `0.1.0`)

Стек: React 19 + TS + Vite + Tailwind, mathjs, KaTeX, three.js, zustand, sql.js, MCP на Node. Проверено по `src/engine/*`, `src/components/*`, `src/store/*`, `src/lib/*`, `mcp/src/*`.

**Ядро-лист (Mathcad-парадигма):**

- Math-блоки `x := 5`, `f(x) := ...`, trailing `=`, `j` (`3+4j`, `Re/Im`), матрицы `[1, 2; 3, 4]`, диапазоны `1..10`, сабскрипты `V_0` в 1 кейстрок, lenient RU/EN-ошибки + did-you-mean (`mathEngine.ts`, `suggestName`).
- Строгий top-to-bottom по `y` + DAG зависимостей + детект циклов + Disabled-регионы (`dependencies.ts`).
- Units через mathjs + `defunit`/`convertTo`/`inUnits`/`hasUnit` + пресеты систем SI/US/CGS (`UnitSys none|SI|US|CGS`, `units.test.ts`).
- Формат чисел `NumFmt auto|sig|fixed` + экспоненциальный порог (ответ SMath-жалобам про significant digits).
- Подстановка значений Calcpad-стиля `expr = subst = result` (`substStr/substLatex`, `subst.test.ts`).
- Шаги решателей free (`solverTrace`: Ньютон/Брент/Нелдер–Мид/Симпсон, бокс «Шаги решателя» в math-блоке — ответ Symbolab-paywall).
- ~150 функций в паках (`packs.ts` ~2770 строк): `seq/linspace`, статистика, `nlsolve/root/bvp/minerr/minimize` (Ньютон+демпфирование, Брент, Нелдер–Мид), `ndiff/nint/nsum`, `lsolve/polyroots/linfit/polyfit`, `taylor/limit`, `dft/idft`, `eigen/rankMat/condNum`, `erf/normpdf/binom/poisson`, интерполяция/трапеции.
- Телеком/ЭМ: `dB/dBm/lambda_f/fspl/skinDepth/waveImp/coaxCap/microstripZ/wgCutoff/friisPr`, Bode `bodeH/bodeMagDb/bodePhaseDeg`.
- CODATA-2022 + материалы + GUM-неопределённость (`uMean/uRect/uTri/uComb/uMC` до 100k, МИ/ПМГ/5725/21748) + бит/ЦОС (`crc16/crc32/lfsrSeq/adcSNR/shannonCap`).
- Справочные данные в SQLite `public/NyaMath.db` (константы, материалы, формулы 529, сниппеты 122, sim-пресеты, SI-префиксы): `db/schema.sql` + `db/seed.json` + `npm run seed`, слой `lib/db.ts`, геттеры синхронные, сверка с NIST в тестах.

**Program-блоки и симуляции (Xcos-лайт):**

- `if/else if/else/end`, `for i in вектор/a..b/n`, `while`, `break/continue/return/assert/trace/breakpoint`, `on error`, `exportName`, локальный scope (свой интерпретатор поверх `EvalFunction`, не `eval`), лимиты 100k/2000 строк.
- Step-debugger + breakpoints + `programTrace` (`ProgramBlockView.tsx`).
- Sim-движок `simEngine.ts`: `euler/rk4/rk45/trbdf2`, events (`cond` + actions + `stop`), FDTD 1D (1000 ячеек/8000 шагов, слои `eps`, gauss/sine), ~24 готовые модели, лимиты честности вместо тихой деградации.

**Графики:**

- 2D plot-блоки: мультисерии `;`, `xy/polar`, `line/bar/stem`, полоса ошибок `plotErr`, `logx`, title/labels/grid/legend, единицы осей `plotXUnit/plotYUnit`, автопревью + `MiniPlot`, даунсэмплинг `max_points`, contour.
- plot3d на three.js (`surface/points/matrix/auto`, сетка, wireframe).
- Экспорт PNG (×2)/CSV, копирование в буфер, печать/PDF через print-CSS + шапка отчёта.

**Канвас/UX/документ:**

- Infinite canvas: drag, мультивыделение, ручной размер `w/h`, сетка/прилипание, undo/redo, виртуализация от 250 блоков, 11+ тем с AA-аудитом контраста, RU/EN, тёмная тема.
- Dynamic Assistant: fuzzy префикс>подстрока>subsequence по scope+константам+функциям+единицам, F12 — весь список (`assistant.ts`, `AssistantPopup.tsx`).
- Command Palette `Ctrl+K` (команды+переменные, fuzzy), контекстное меню мат-блока (Clickable Math по-Maple), экранная мат-клавиатура `π √ ≤` (`MathKeyboard`), подсветка переменной по листу (`varHighlight.ts`), статус-бар (состояние/ошибки/время расчёта), Quickstart «парабола+слайдер+график в 1 клик», шаблоны ГОСТ (балки/цепи/допуски 25346-2013, `templates` в БД).
- Слайдеры (`sliderVar/Min/Max/Step/Val` → живой пересчёт), text-блоки (Markdown-лайт), KaTeX + LaTeX-paste.
- Файлы: save/open JSON с валидацией + миграцией + пином `ENGINE_VERSION` (Pluto-урок manifest), автосейв localStorage, serverless share-ссылки `#d=` (slim-кортежи → фразовый словарь → deflate-raw → base64url) + `#t=ex` для примеров.
- Пересчёт: Web Worker + timeout 30с + cancel (ответ Maple-зависаниям), инкрементальный dirty-recalc видимых + upstream (Calculate Now из Prime 11, режимы auto/manual, `StaleChip`), кэши parse/compile/deps/LaTeX LRU-2000, перф-тест 300 блоков.
- MCP + Live Sync: 20+ инструментов (`status/list/get/add/update/move/resize/remove/clear/evaluate/scope/plot_data/plot3d_data/open/save/load_example/recalc/diff/import/ask/answer/sync_pull/sync_push`), ресурс `nya://document`, SSE `/events` + `POST /push` + `/snapshot|/status`, `rev` last-writer-wins, echo-suppression, импорт `.sm` (XML/RPN→infix) и `.cpd` (`nya_import`), git-friendly `nya_diff` (JSONL + unified hunks).

## 4. Чего НЕ хватает (бэклог по приоритетам)

**P0 — быстрые победы (1–3 дня каждая):**

- [x] Phasor-вид `|Z|∠φ` для комплексных (электрики просят везде — Flow-фича). ✅ Готово 22.09.2026: `ComplexFmt rect|polar|both` в `mathEngine.ts` (текст + KaTeX `5\angle 53.13^{\circ}`), `envTag` + воркер-протокол + стор с персистом + подменю Вид → Комплексные; `phasor.test.ts` (6 шт).
- [x] Режим «Отчёт» + флаги видимости `show|hide|input|result` (Calcpad-паттерн `#hide/#pre/#post` для экспертизы; print-CSS фильтр + превью на холсте). ✅ Готово 04.10.2026: `BlockVisibility` в `dependencies.ts`, `visibilityOf/isReportVisible` + `normalizeBlock` (`blocks.ts`), стор `reportPreview/setBlockVisibility/setSelectedVisibility`, `report.ts/wordExport.ts/print.ts` уважают флаги, `data-visibility` во всех 7 видах блоков, Вид → Отчёт + правый клик + `Ctrl+K`, RU/EN.
- [x] Автосейв-снапшоты/TimeTravel поверх undo/redo (ответ no-autosave Mathematica и corrupt Maple). ✅ Готово 04.10.2026: `lib/snapshots.ts` (кольцо 20 в localStorage, авто раз в минуту из `App.tsx`, ручные), Файл → Снапшоты (восстановление за 1 undo-шаг), `snapshots.test.ts`.
- [x] Excel двусторонний: импорт CSV/TSV (SheetJS не понадобился — свой парсер с `;`/таб/десятичной запятой) в матрицы `M := [...]` + экспорт scope → CSV/XLS (Excel-открываемый `.xls` как Word-HTML, zero-deps). ✅ Готово 04.10.2026: `lib/tableIO.ts` + Файл → Импорт/Экспорт + `tableIO.test.ts` (17 шт). Настоящий бинарный `.xlsx` (нужен zip) — бэклог.
- [x] Markdown/LaTeX-экспорт документа (`report.ts` уже генерирует — допилить до `.md/.tex`). ✅ Готово 04.10.2026: учёт видимости, подстановки, подписи графиков/моделей, `input/result`-режимы.
- [x] Стили плотов «для статьи» + SVG-экспорт без артефактов + multi-axis (Origin-урок; PNG/CSV уже есть). ✅ Готово 04.10.2026: `exportSvgElementToFile` + кнопка SVG в plot-блоке, флаг `plotPaper` (белый фон/чёрные оси/serif), вторая ось `plotY2Fn/plotY2Label` с правой шкалой + легендой, всё в `plotBlockToCode/patch` (дублирование 1:1).

**P1 — ядро и масштаб (1–2 недели):**

- [x] Yjs-CRDT поверх Live Sync (сейчас LWW `rev`) + курс-режим (раздача `#t=` + сбор через `nya_get_scope`) — дотянуть до CalcTree/CoCalc. ✅ Готово 22.09.2026 — CRDT-лайт без новых зависимостей: per-block LWW-Map + tombstones + three-way merge (`src/lib/syncCrdt.ts`, 11 тестов); браузер шлёт `meta/deleted`, сервер мёржит stale-push с meta вместо 409 (legacy без meta — 409 как раньше; `mcp/test/crdt.mjs`, 10 e2e-чеков). Полный Yjs + курс-режим — следующий шаг.
- [x] Библиотека шаблонов как продукт (fxSolver-паттерн): сейчас 6 ГОСТ-шаблонов — нужны десятки (балки, цепи, допуски, теплотехника) с версионированием в git. ✅ Готово 22.09.2026: 16 шаблонов в 8 разделах (балки/цепи/допуски/тепло/вибрации/гидравлика/МКЭ/сигналы) + поддержка program/plot-строк в шаблонах, меню с группировкой по разделам, каждый шаблон считается без ошибок (`templates.test.ts`, 18 шт). Паки: `argDeg/fromPolar/beamKe/beamFe/barKe` + сниппеты палитры. ➕ 04.10.2026: 26 шаблонов (+конвекция, многослойная стенка, маятник, демпфер, слив бака, насос, Тевенен, реактансы, ОУ, зазор).
- [x] PWA + offline + touch-палитра + планшетный history-lane (Desmos/HiPER-уроки). ✅ Готово 22.09.2026 (частично): `manifest.webmanifest` + `sw.js` (stale-while-revalidate, навигация network-first) + регистрация только в production (`pwa.ts`, `pwa.test.ts`); touch-палитра/экранная клавиатура уже была (`MathKeyboard`), history-lane — бэклог.
- [x] Property Inspector + «Show Code» для плота (MATLAB-паттерн: покрутил мышью → получил код). ✅ Готово 22.09.2026: панель «Показать код» в plot-блоке (настройки текстом 1:1 + копирование + «Дублировать график», `plotCode.ts`, 5 тестов + `plotDup.test.ts`). ➕ 04.10.2026: полный набор инспектора — бумажный стиль, вторая ось Y2 и SVG-экспорт тоже в коде/патче. Полный Property Inspector-сайдбар — бэклог.
- [x] Малая FEA-демо (плоская рама 8-DOF как у CalcpadCE; `solveLinear` уже есть). ✅ Готово 22.09.2026: `beamKe/beamFe/barKe` в паках + шаблон `fea-cantilever-1el` (МКЭ = аналитике −FL³/3EJ с невязкой < 1e-9, `fea.test.ts`, 5 шт).
- [x] Экспорт `.docx` через `docx` npm + MathML→OMML (Calcpad-фича для проектных записок). ✅ Готово 22.09.2026 — без зависимостей: Word-HTML `.doc` (открывает Word/LibreOffice; формулы `raw = result`, секции, программы, подписи фигур, `wordExport.ts`, 4 теста + пункт Файл → Отчёт Word). Настоящий `.docx`/OMML (нужен zip) — бэклог.

**P2 — дорого, но возможно (1–2 мес.):**

- [ ] Pyodide-WASM Python-блок (Advanced Controls из Prime 11) — опциональным чанком, не в base-бандле (~10MB, медленный старт).
- [ ] OCR с фото (Tesseract.js) + handwriting — только nice-to-have, точность ниже Photomath-native.
- [ ] Tauri/Capacitor-десктоп для air-gap enterprise (тот же React-код, но пайплайн подписи/обновлений).
- [ ] Дотянуть `simplify/sderiv/expand/sfactor` (честный максимум numeric-first; полный CAS — см. ниже «нельзя»).

**Не берём (принципиально не в нашем стеке):**

- Полный CAS уровня Mathematica/Maple (ядро на C/Lisp 40 лет правил; Maxima-в-WASM — сотни МБ и тормоза).
- MATLAB-производительность (MKL/CUDA/DL-Toolbox; в браузере только `Float64Array` + GC-паузы; большие гриды — только даунсэмплинг, уже делаем).
- Hard-realtime/FEM уровня Ansys/COMSOL (нет детерминизма event loop, RAM вкладки 2–4GB; наш FDTD-лимит 1000×8000 — честный потолок).
- Big-decimal 100 знаков без потери скорости (ломает `Unit` + в 10–100× медленнее; держим double + `uncRound` для метрологии).
- Нативные COM/USB/GDI-интеграции (Creo/Windchill/AutoCAD/VISA/EMF 1:1) — только через внешний MCP-мост, не из песочницы браузера.
- Free Cloud GPU как Colab (противоречит serverless free-forever; только локальный WebGPU).
- Серверный AI-RAG offline в браузере (GB весов + слабый reasoning; наш путь — AI снаружи через MCP, ядро детерминировано для экспертизы).
- License-server/SSO как у PTC (осознанно нет — serverless без phone-home лучше проходит restrictive-IT; достаточно лицензии + SBOM + offline-PWA).

---

_Источники: PTC Mathcad Prime G2/Capterra/Community + Prime 12 release notes 04.2026; SMath smath.com/reviews + Forum; Calcpad calcpad.eu + CE-fork 03.2026; Maplesoft compare/mathcad + Flow docs + Trustpilot Maple 2.3; Wolfram/TechRadar/HN; MathWorks Central + Live Editor UX-blog 06.2025; Octave/Scilab docs + G2; Pluto.jl GitHub/discourse; Jupyter PMC 8106381 + Colab docs; Desmos/GeoGebra обзоры + App Store; Symbolab/Photomath App Store + ScreensDesign/NextSprints; OriginLab G2/Capterra; HiPER Play 260K 4.7; IndustrialMonitor 07.2026 + EAC Mathcad-vs-MATLAB 03.2026; Maplesoft Maple-2026 MCP-анонс._
