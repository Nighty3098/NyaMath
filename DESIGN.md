# DESIGN.md — Дизайн инженерно-математических программ: скриншоты + отзывы

> Дата: 20.09.2026. Объект: NyaMath — инженерный лист в браузере (формулы как на бумаге, live-пересчёт, units, 2D/3D, program-блоки, infinite canvas).
> Задача: посмотреть, как выглядят 15+ программ для инженеров/математиков, собрать отзывы о дизайне (что хвалят / что ругают) и зафиксировать выводы для нашего UI.
> Метод: веб-поиск + отзывы G2/Capterra/Trustpilot/App Store, Reddit (r/matlab, r/engineering, r/StructuralEngineering, r/AskEngineers, r/math), PTC Community, SMath Forum, Wolfram Community, Hacker News, Jupyter UX-аудиты, блоги MathWorks/Maplesoft, разборы ScreensDesign/NextSprints.
> Связанный файл: `DOC.md` — там ресёрч по функциям/жалобам в целом; здесь — только про дизайн/UX.

---

## 0. Где смотреть скриншоты (первоисточники)

Я не встраиваю картинки в markdown (они протухают), а даю точки входа, где скриншоты точно есть:

- **PTC Mathcad Prime** — хелп «About the PTC Mathcad Prime Workspace» (Title Bar, Ribbon, QAT, Open Worksheets Bar, Status Bar, Functions Window) + превью-скрины Prime 1.0 alpha с программированием/матрицами/плотами с юнитами:
  - https://support.ptc.com/help/mathcad/r11.0/en/PTC_Mathcad_Help/about_the_mathcad_workspace.html
  - https://walkingrandomly.com/?p=2540
  - https://walkingrandomly.com/?p=2884
- **SMath Studio** — официальный сайт + форум (темы про UI, палитры, фон регионов):
  - https://smath.com + темы `Different issues`, `Description region`, `Updated menu/toolbar`, `SMath Studio UI problem` на https://smath.com/en-US/forum/
- **Calcpad** — главная + блог про язык + Wikipedia (схема Code слева → HTML-отчёт справа):
  - https://calcpad.eu/
  - https://calcpad.blog/the-calcpad-language/
  - https://en.wikipedia.org/wiki/Calcpad
- **Maple / Maple Flow** — Clickable Math, Tutors, Document mode:
  - https://www.maplesoft.com/products/maple/features/tutors.aspx
  - https://www.maplesoft.com/products/maple/demo/player/ClickableMath.aspx
- **MATLAB Live Editor + новый Figure Toolstrip** — блог UX-команды MathWorks + треды Answers/Reddit:
  - https://blogs.mathworks.com/graphics-and-apps/2025/06/30/designing-the-new-figure-toolstrip-around-user-experience/
  - https://www.mathworks.com/matlabcentral/answers/308001-live-script-comments-and-critique
  - https://www.reddit.com/r/matlab/comments/lgkq51/dear_mathworks_please_make_the_live_editor_less/
  - https://www.reddit.com/r/matlab/comments/1qvprde/matlab_2025_ide_struggles/
- **Mathematica** — Wolfram Community про палитры + HN-тред про workbook UI:
  - https://community.wolfram.com/groups/-/m/t/1238569?sortMsg=Recent
  - https://news.ycombinator.com/item?id=10934851
- **JupyterLab** — UX-аудиты и user-testing:
  - https://github.com/Quansight-Labs/JupyterLab-user-testing/blob/main/results/user-testing-results.md
  - https://github.com/jupyterlab/jupyterlab/issues/6593 (UX audit 1.0)
  - https://github.com/jupyterlab/jupyterlab/issues/3911 (feedback sidebar/tabs/copy)
- **Desmos** — обзоры дизайна:
  - https://rankeno.com/apps/desmos-graphing-calculator-1769158046138
  - https://blog.desmos.com/articles/desmos-calculator-update-navigating-the-new-keypad/
  - https://www.merlot.org/merlot/viewCompositeReview.htm?id=707032
- **GeoGebra** — usability-исследования + Reddit:
  - https://doi.org/10.1007/978-3-642-39473-7_36 (сравнение GeoGebra vs Sketchpad)
  - https://www.reddit.com/r/math/comments/1738b50/why_the_geogebra_hate/
  - https://claritybrief.net/tech/geogebra-review-interactive-math-tools-2026-9395775
- **Photomath / Symbolab** — покадровые UX-разборы (onboarding, paywall, camera-loop, solution cards):
  - https://screensdesign.com/apps/photomath/
  - https://screensdesign.com/showcase/photomath
  - https://screensdesign.com/apps/symbolab-math-problem-solver/
  - https://nextsprints.com/guide/photomath-product-teardown-analysis
  - https://thetoolsverse.com/blog/photomath-vs-symbolab

---

## 1. Что видно на скриншотах (компоновка по программам)

### 1. PTC Mathcad Prime (эталон «лист = отчёт»)

**Скриншот:** окно Windows, сверху Title Bar + PTC-кнопка, Ribbon-вкладки (Input/Functions/Matrices/Plots), Quick Access Toolbar, под ним таб-бар открытых листов, центр — белый постраничный лист с регионами (текст + `x := 5` + `y =` + график), справа — Functions Window (поиск по категориям/именам), снизу Status Bar (номер страницы, кружок состояния расчёта, зум-слайдер, Page/Draft View).
**Паттерн:** WYSIWYG-регионы на странице A4, всё в стандартной мат-нотации, юниты прямо в строке.
**Нам взять:** постраничный Print-режим + Draft (бесконечный) как два вида; Functions-палитра с поиском; индикатор состояния расчёта в статус-баре.

### 2. Mathcad 15 (legacy, любят до сих пор)

**Скриншот:** классические серые тулбары + припаркованные палитры (Calculator, Graph, Matrix, Calculus), жёлто-белый лист без Ribbon, плоты с подписями/сеткой.
**Паттерн:** палитры можно парковать, всё в 1 клик, плоты «богатые».
**Нам взять:** keyboard-first ввод (`:=`, `.` для сабскрипта, `;` для серий) + докируемые палитры, а не только Ribbon.

### 3. SMath Studio («Mathcad 15, но 2 МБ»)

**Скриншот:** MDI-окно, сверху меню+тулбар, справа вертикальная стопка палитр (Arithmetic, Matrices, Boolean, Functions, Plot, Programming, Symbol), центр — лист с жёлтым фоном math-регионов, снизу Dynamic Assistance (подсказки).
**Паттерн:** paper-like, portable, всё из коробки.
**Нам взять:** Dynamic Assistance (fuzzy по scope+units+функциям) — самая хвалимая фича; подсветка переменной по всему листу при наведении.

### 4. Calcpad / CalcpadCE (код → красивый отчёт)

**Скриншот:** два столбца: слева Code-редактор с подсветкой (`"Title"`, `'текст в кавычках'`, `L = ? {6}m`, `$Plot{...}`, `#post/#hide`), справа HTML-отчёт с каллиграфическими формулами и подстановкой значений (`V_0 = q·L/2 = 30 kN`), сверху кнопки Calculate/Input Form/Print/Export docx.
**Паттерн:** code-style DSL + `#pre/#post/#hide`, `?` превращает строку в HTML-форму для заказчика.
**Нам взять:** подстановка значений в выводе; режимы видимости; Input Form как аналог наших slider-блоков.

### 5. Maple Flow (свободный canvas)

**Скриншот:** бесконечный холст, регионы можно таскать как стикеры, Variables palette, Table of Contents автосборка, AI Formula Assistant, фазоры `|Z|∠φ`.
**Паттерн:** «салфетка», а не жёсткий лист; порядок вычисления по зависимостям, а не по Y.
**Нам взять:** свободное позиционирование — у нас уже canvas; но наш строгий top-to-bottom по `y` понятнее студенту — держать, плюс показывать стрелки зависимостей.

### 6. Классический Maple (Clickable Math)

**Скриншот:** Document mode как Word: текст + inline-математика, контекстное меню по правому клику («Solve», «Plot», «Differentiate»), палитры символов, Tutors-визарды, Math Apps.
**Паттерн:** сложные операции без синтаксиса, tutors пошагово.
**Нам взять:** контекстное меню «что можно сделать с этим выражением» + визарды поверх CAS-команд.

### 7. Wolfram Mathematica (notebook + палитры)

**Скриншот:** notebook-ячейки `In[]/Out[]`, сверху Formatting Bar, по бокам плавающие палитры (Basic Math Assistant, Classroom Assistant), Manipulate-слайдеры внутри документа, Help-браузер — лучший на рынке.
**Паттерн:** всё-в-одном (символьное+численное+ML+гео), notebook JSON + CDF.
**Нам взять:** Manipulate = наши slider-блоки; Help с живыми примерами; NL-ввод как «костыли» для новичков (у нас — lenient RU/EN-ошибки).

### 8. MATLAB + Live Editor + новый Figure Toolstrip (2025)

**Скриншот:** Live Script: код + вывод + форматированный текст + формулы LaTeX в одном документе; Figure — таб-контейнер с Toolstrip (Figure/Format/Tools/Layout), справа Property Inspector + сгенерированный код (Show Code), Property Inspector-сайдпанель.
**Паттерн:** интерактив + воспроизводимость: покрутил график мышью → получил код.
**Нам взять:** «Show Code» для плота (UI-жест → код) — киллер-фича для обучения; тулстрип по workflow-вкладкам, а не свалка кнопок.

### 9. GNU Octave / Scilab / Xcos

**Скриншот:** IDE из коробки: редактор с подсветкой, Variable Browser, Console, Help с примерами; Xcos — dataflow-граф блоков как Simulink-лайт.
**Паттерн:** всё нужное уже открыто, `mfile2sci`-транслятор для миграции.
**Нам взять:** Variable Browser (наш `nya_get_scope` как UI-панель); транслятор чужих форматов (у нас уже `nya_import` для `.sm`/`.cpd`/`.xmcd`/`.xmcdz`/`.mcdx` и drag&drop в UI — развивать).

### 10. Julia + Pluto.jl (реактивный notebook)

**Скриншот:** ячейки сверху-вниз, `@bind`-слайдеры, при смене одной ячейки пересчитывается только зависимый DAG, нет hidden state; ноутбук = чистый `.jl`-файл с пинами версий.
**Паттерн:** «как spreadsheet»: поменял — пересчиталось зависимое.
**Нам взять:** идеал — реактивный DAG; пока у нас full-recalc сверху-вниз — next step инкрементальный dirty-recalc + показ времени расчёта.

### 11. Jupyter / JupyterLab / Colab / Kaggle

**Скриншот:** Lab: левая сайдбар-навигация (файлы/TOC/расширения), центр — ячейки `In[17]` с outputs (графики/таблицы), верх — Command Palette (`Ctrl+K`), статус-бар ядра.
**Паттерн:** kernel-протокол + cell-модель + `.ipynb` JSON.
**Нам взять:** Command Palette с fuzzy-поиском — обязательно; TOC-навигацию; хранить slim-JSON без outputs в git (как наш `/snapshot`).

### 12. Desmos Studio (эталон простоты)

**Скриншот:** слева список выражений (каждое цветное, со слайдером), справа большой график, снизу выдвижная мат-клавиатура (`π √ ≤`), сверху undo/redo, POI-точки, Projector Mode.
**Паттерн:** «пришёл — и сразу строишь»: `y=x^2`, двигаешь слайдер — график живёт; цвета/анимации/озвучка графика.
**Нам взять:** двухпанельный layout «список → визуал», автопревью <16ms, экранная клавиатура, Projector Mode для пар.

### 13. GeoGebra (всё-в-одном для школы)

**Скриншот:** 5+ видов сразу: Algebra + Graphics + CAS + Spreadsheet + 3D, Input Bar снизу, тянем точки мышью, tube.geogebra.org для шаринга.
**Паттерн:** drag-and-drop геометрия + алгебра + CAS в одном.
**Нам взять:** связку plot+geometry как бэклог; но НЕ повторять 6 отдельных приложений — у нас один canvas со всеми kinds.

### 14. Symbolab / Photomath / MS Math Solver / WolframAlpha («домашка за 5 сек»)

**Скриншот (мобайл):** камера с рамкой-наводкой → карточка «распознанное → ответ» → вертикальный таймлайн шагов (каждый шаг: правило-чип + формула KaTeX + expand-объяснение), снизу мат-клавиатура, таб-бар Solve/History/Profile.
**Скриншот (десктоп Symbolab):** строка ввода + мат-клавиатура + 500+ калькуляторов (limits/integral/ODE), steps-панель, Problem Generator.
**Паттерн:** scan-to-solve loop за секунды; ответ free, шаги — paywall.
**Нам взять:** пошаговый решатель free как дифференциатор; камеру/рукописный ввод — в бэклог; KaTeX-рендер обязателен.

### 15. OriginPro / LabPlot / SciDAVis (плоты для статей)

**Скриншот:** тройка Worksheet-Matrix-Graph: слева таблица Excel-copy-paste, справа multi-panel график с multi-axis, сверху Fitting/Stats-визарды (Peak/Gauss/ANOVA), экспорт EMF без артефактов.
**Паттерн:** publication-quality в 2 клика без кода + batch-анализ.
**Нам взять:** темы/стили плотов из коробки, PNG/CSV уже есть — добавить пресеты «для статьи» + multi-axis.

### 16. HiPER Calc / RealCalc / Numbat / Soulver (карманные)

**Скриншот:** HiPER — плотный калькулятор с history-лентой, SI-префиксы, hex/oct/bin, темы; Numbat — терминал/веб с юнитами (`10 m + 2 ft →`); Soulver — «блокнот»: пишешь словами, получаешь ответ.
**Паттерн:** точность (100 знаков), юниты из коробки, текст+математика в одной строке.
**Нам взять:** Numbat-units UX как идеал; Soulver-гибрид «текст+математика» — у нас text+math на одном canvas уже близко.

### 17. CalcTree / fxSolver (новые web)

**Скриншот CalcTree:** realtime-курсоры 2+ инженеров, версионность, AI-черновик по стандарту + AI-ревью, Markdown import/export.
**Скриншот fxSolver:** библиотека тысяч формул: вбил значения → Solve, связка переменных между формулами, plot из list-значений.
**Паттерн:** коллаба + библиотека готовых формул как продукт.
**Нам взять:** Live Sync довести до CRDT/TimeTravel; библиотеку examples как MVP fxSolver-библиотеки.

---

## 2. Что людям НРАВИТСЯ в дизайне (с цитатами/источниками)

1. **«Как в учебнике» (Mathcad/SMath/Calcpad-отчёт).** `:=` и trailing `=`, юниты в строке, подстановка значений. «Looks neat and organized», «just change value at top — it carries» (r/AskEngineers). SMath хвалят за Dynamic Assistant + autocomplete (F12-подсказки) — бывшие mathcad'овцы называют это главной фичей.
2. **Zero-friction старт (Desmos).** «Masterclass in purpose-driven design… near-total lack of onboarding friction. You arrive, and you begin» (Rankeno). «List of expressions on left, visualization on right… tool gets out of the way» (Rankeno; MERLOT Ease of Use 5.0/5). Цветовое кодирование уравнений + слайдеры + табличное/графическое/формульное представление одновременно (TeachersFirst, Des-blog).
3. **Clickable Math (Maple).** «Palettes, interactive assistants, context-sensitive menus, and tutors make it easy… Students still have option of command interface, but that's not how they interact anymore» (Rose-Hulman/Dr. Holden). «Make learning curve as short as possible… mathematical expressions show up exactly like in textbooks» (там же). PCMag 2007: «Mathcad on steroids… enter text and math as in word processor».
4. **Интерактив → код (MATLAB Figure Toolstrip 2025).** UX-команда MathWorks: «If I make changes interactively using UI, I can't reuse… It's just wasted effort» → сделали «Show Code» (интерактивный жест → воспроизводимый код). MAB-реакция «overwhelmingly positive». Нам — прямой образец.
5. **Реактивность без hidden state (Pluto).** «No hidden state», «notebook = pure .jl-file (git-friendly)», `@bind`-слайдеры. Контраст с Jupyter, где лишь ~24% ноутбуков выполняются без ошибок и ~4% воспроизводят результаты (PMC-исследование 863K ноутбуков — есть в DOC.md).
6. **Command Palette + TOC (JupyterLab).** «Ability to call command palette with keyboard shortcut while doing any task was praised» (Quansight user-testing). TOC полезен для навигации, но «only one participant was aware» — урок про discoverability.
7. **Scan-to-solve loop (Photomath).** «Core scan-to-solve loop remarkably fast and accurate… moment app recognizes equation and displays solution feels like magic» (ScreensDesign). «Floating camera button, swipeable solution steps, color-coded explanations» (NextSprints). Чистая камера-наводка + solution cards «answer first, expandable steps» (ScreensDesign Showcase).
8. **Документ = отчёт + шеринг ссылкой (Calcpad/fxSolver/CalcTree).** Calcpad: «professional looking Html reports… with substitution of variables… useful for structural calculations» (calcpad.eu, Simulation Authority). fxSolver: «вбил → Solve, связал переменные, построил plot» без установки. CalcTree: realtime-коллаба + версионность без `.sm` по почте.
9. **Карманная плотность (HiPER/Numbat).** HiPER 4.7★ 260K отзывов: history-лента, темы, 100 знаков, матрицы/статистика на планшете. Numbat: юниты в терминале — «гики в восторге».
10. **Help как продукт (Mathematica/Maple/Desmos-activities).** Mathematica Help — «лучшая на рынке» + бесплатные курсы; Maple Tutors/Math Apps; Desmos Classroom Activities + Projector Mode.

---

## 3. Что людям НЕ нравится в дизайне (боли с источниками)

1. **Ribbon вместо палитр (Mathcad Prime).** «Not a fan of Microsoft-like ribbon» (WalkingRandomly). PTC Community: «blurry icons, several types of fonts, light blue does not fit engineering program… open Office 2010 and Prime 2 side by side and compare: clear icons, one font, speed». Сабскрипты в 2 клика (было в 1), «can't dock palettes», плоты «бедные — уносят данные в Excel». r/StructuralEngineering: «missing features for report formatting, custom page numbers». r/AskEngineers: «conversion M15→Prime cripples usability», «Prime is terrible, stick with 15».
2. **Устаревший UI (SMath).** Форум: жёлтый фон по дефолту («prefer white background by default»), «font/size/color out of user's control», «description background yellow is cool, but not always», нет dark-theme («white text on light grey… inconsistent» [SS-2410]), Mono-костыль на Linux/Mac («Windows in costume»), мелкие символы в палитрах («size is quite small»), Single Instance по дефолту лечится только `SingleInstance=0` в `settings.inf`. Мелочи редактора: DELETE стирает 2 символа, HOME/END едут не туда, TAB не ходит по плейсхолдерам (топик `Minor UI issues`, 11 пунктов).
3. **Code-only без WYSIWYG (Calcpad).** Порог для mathcad-привыкших («пишешь код, а не формулы»), кавычки для текста путают; нет кастомных тем (палитра захардкожена); web-viewer read-only.
4. **Live Editor тормозит и «скроллится как iPad» (MATLAB).** Answers: «sporadically sluggish with plotting», «contrast is not sufficient». Reddit: «forces weird accelerating smooth scrolling… as if designed for iPad», «different font for code with no way to change», «little bugs when right-clicking/minimizing». R2025a: «20% more chrome, 80% less confidence… Chromium wrapper… Workspace doesn't refresh, directory browser stalls, highlighting glitches, settings wiped» (LinkedIn/Jed Frey + r/matlab 2026). Урок: Web UI без полировки = regression in trench coat.
5. **Палитры поверх ноутбуков (Mathematica).** «They overlay each other and notebooks… users close palettes» (Wolfram Community). «Look archaic», «unchanged from 2008… not very pretty», на маленьком laptop «constantly move palette or close it». HN: «hate online workbook UI… delete image → refresh page; enter incorrectly → undeletable newline; formatting — good luck». Undo долго не работал в notebook.
6. **Java-переписывание убило UX (Maple).** HN: «startup tenth of second → 30 seconds… every part laggy and glitchy, crashed regularly… gimmicky standard-math typography… slow, confusing». Classic Maple без dark mode годами.
7. **Сайдбар жрёт место + табы + копирование (JupyterLab).** «Sidebar takes too much space even when collapsed… want option to remove entirely» (#3911). «Prefer separate notebooks in separate browser tabs» (#3911). «Difficult to copy text/image outputs… have to open different view» (#3911). Аудит #6593: кривые иконки, фокус после создания папки не открывает её, в Command Palette нет крестика очистки поиска, `...` вместо `filter_list`. User-testing: «no designated focus state… blatantly inaccessible», «low contrast unpleasant, especially syntax highlighting», «cell status exclusively visual (prompt+favicon)», «command palette only direct matches, no fuzzy».
8. **Сложный онбординг (GeoGebra).** «Walking into hardware store when you only need to hang one picture… built for power, not onboarding» (Nibble). «Vast array confuses new users» (AnalyticsInsight). Исследование: «not finding Input Help… icon not visible», «menu complex, remember steps not easy», «error messages show errors but no hints», «CAS tools not enough for easy use». Reddit: «newest version buggy and unnecessarily complicated… randomly deletes lines… saving doesn't work». SUS 58.3 vs Sketchpad 71.7.
9. **«Игрушечность» Desmos для вуза.** Нет CAS/diff/integral символьно, нет units/документов-отчётов, нет матриц/ODE/программирования. Для старших курсов «too simple».
10. **Paywall шагов + клавиатура (Symbolab/Photomath).** Symbolab: ответ free, шаги — Pro ($6.99–9.99/мес); «free tier answers only, with ads»; редизайн клавиатуры 2021 — «верните старую»; «no preview before paying». Photomath: Plus прячет animated tutorials/textbook solutions ($9.99/мес); «keyboard clunky when camera fails»; «word problems without explicit notation struggle». Общее: «steps are what teach you» — прятать их = бить по retention.
11. **Стиль 90-х (OriginPro).** G2: «Not User-Friendly, Complexity», Capterra: «plots like from 90s», только Windows полноценно, `.opj` только через Viewer.
12. **Реклама и consent-стена (HiPER free).** «Ads + consent 500+ third parties (AdMob) → instant removal» (отзыв 2026); popups/tutorials при старте даже в Pro; смена раскладки без спроса. Урок: без рекламы как принцип.

---

## 4. Сводная таблица: паттерн → вердикт пользователей

| Паттерн                                         | Где                 | Вердикт                               |
| ----------------------------------------------- | ------------------- | ------------------------------------- |
| Лист как бумага + `:=`/`=` + юниты в строке     | Mathcad/SMath       | ❤️ любят, это ядро                    |
| Подстановка значений в выводе                   | Calcpad             | ❤️ идеально для экспертизы            |
| Dynamic Assistance / autocomplete               | SMath               | ❤️ самая хвалимая фича                |
| Слева формулы → справа график, слайдеры         | Desmos              | ❤️ zero-friction эталон               |
| Clickable Math (правый клик → действие)         | Maple               | ❤️ короткий learning curve            |
| Интерактив → код (Show Code)                    | MATLAB 2025         | ❤️ reproducibility                    |
| Command Palette (fuzzy) + TOC                   | JupyterLab/Pluto    | ❤️ если есть fuzzy и discoverable     |
| Scan → steps-карточки                           | Photomath           | ❤️ magic moment                       |
| Переменные-палитра + Help с живыми примерами    | Flow/Mathematica    | ❤️ для новичков                       |
| Ribbon на весь экран                            | Prime/Matlab        | 💔 хотят докируемые палитры + hotkeys |
| Жёлтый фон, мелкие иконки, WinForms/Mono        | SMath               | 💔 «из 2008»                          |
| Hidden state `In[17]→In[15]`                    | Jupyter             | 💔 только 4% reproducible             |
| 6 приложений вместо одного                      | GeoGebra            | 💔 путает                             |
| Шаги за paywall, ads + 500 consent              | Symbolab/HiPER      | 💔 бьёт по доверию                    |
| No-autosave, corrupt файлов                     | Mathematica/Maple   | 💔 теряли часы                        |
| Smooth-scroll как на iPad, низкая контрастность | Live Editor/Jupyter | 💔 a11y-боль                          |

---

## 5. Выводы для NyaMath (что делаем / чего не делаем)

**Делаем (взять лучшее):**

1. **Paper-first canvas:** math-блоки `:=` + trailing `=`, KaTeX-рендер, юниты в строке, подстановка значений как в Calcpad. Два вида: Draft (бесконечный) + Page (A4 для печати/PDF).
2. **Dynamic Assistant обязательно:** fuzzy-поиск по scope + функциям + юнитам (как SMath F12), префиксное дерево, подсветка переменной по всему листу при наведении, `significant digits` vs `fixed` (как SMath).
3. **Desmos-скорость:** автопревью плота <16ms, двухпанельность «формулы → график», экранная мат-клавиатура (`π √ ≤`), слайдер-блоки как `@bind`/Manipulate, Projector Mode для пар.
4. **Clickable Math по-Maple:** правый клик по выражению → «Solve / Plot / Differentiate / Convert units», Tutors-визарды для сложного.
5. **Show Code по-MATLAB:** покрутил плот мышью → получил код表达式; Property Inspector-сайдпанель для плота (темы «для статьи», multi-axis).
6. **Command Palette + TOC:** `Ctrl+K` fuzzy по командам/переменным/примерам (урок Jupyter: только direct-match = провал), авто-TOC из text-блоков.
7. **Панели как в IDE:** Variable Browser (`nya_get_scope` в UI), Functions Window с поиском (как Prime), статус-бар с состоянием расчёта + временем расчёта (как SMath) + зум.
8. **Отчётность:** `#pre/#post/#hide`-аналог (видимость блоков), share-линк `#d=` + `#t=ex` (сильнее `.sm`-файлов и cloud-only CalcTree), PNG/CSV + print CSS, экспорт в Word — в бэклог.
9. **Шаги — бесплатно:** пошаговый решатель free как дифференциатор против Symbolab-paywall; lenient RU/EN-ошибки с хинтами (урок GeoGebra «errors with no hints»).
10. **Help как продукт:** примеры variant20/advanced + встроенный reference book + classroom activities по-Desmos.

**Не делаем (выученные грехи):**

1. Никаких Ribbon-свалок и blurry-иконок — докируемые палитры + keyboard-first (`:=`, `_`, `;`, `TAB` по плейсхолдерам, `HOME/END` по строке).
2. Никакого «жёлтого 2008» — современный React+Tailwind, светлая/тёмная темы с AAA-контрастом, настраиваемый фон регионов, нормальный размер символов в палитрах.
3. Никакого hidden state — строгий top-to-bottom по `y` + DAG + cycle detection (уже есть), next — инкрементальный dirty-recalc видимых регионов (Calculate Now из Prime 11) + воркер с cancel/timeout.
4. Никаких 6 приложений — один canvas со всеми kinds (math/text/plot/plot3d/program/slider).
5. Никаких paywall шагов / рекламы / license.dat / вотермарок — serverless free forever, local-first + offline (контрпозиция Colab-таймаутам и cloud-лицензиям PTC).
6. Никаких палитр поверх ноутбука на маленьком экране — сайдпанели сворачиваются, палитры не перекрывают canvas, фокус-состояния видимы с клавиатуры (a11y: фокус, контраст подсветки, не только цвет для статуса ячейки, поддержка browser zoom).
7. Никаких потерь — автосейв + JSON + undo/redo + snapshots/TimeTravel (урок Mathematica/Maple), slim-JSON без previews в git (урок `.ipynb` с base64).
8. Provenance явно: лицензия + юрисдикция в репо (урок бана SMath в enterprise IT), формат версионирован, migrator чужих форматов развивать (`nya_import` для `.sm`/`.cpd` уже есть).

---

## 6. Чек-лист для UI-ревью NyaMath (перед каждым релизом)

- [x] `Ctrl+K` находит команду/переменную по опечатке (fuzzy-тест)? — done 21.09.2026: Command Palette (команды + переменные, `src/lib/cmdPalette.ts`, fuzzy через `assistant.fuzzyScore`).
- [x] Clickable Math: правый клик по блоку предлагает действия (Maple-паттерн)? — done 21.09.2026: контекстное меню мат-блока (портал, `role=menu`, Esc/backdrop закрывают).
- [x] Экранная мат-клавиатура `π √ ≤` (Desmos-паттерн)? — done 21.09.2026: `MathKeyboard` (вставка в курсор открытого редактора, иначе новый блок с прицела; `insertSnippet` + тесты).
- [ ] Новый пользователь строит `y=x^2` + слайдер за <60 сек без туториала (Desmos-тест)?
- [x] Быстрый старт в 1 клик (парабола + слайдер + график)? — done 21.09.2026: `loadQuickstart` (a, f(x), слайдер, plot) — hero-кнопка приветствия + меню Примеры + команда Ctrl+K; тест считает лист без ошибок.
- [x] TAB ходит по плейсхолдерам (строчный редактор)? — done 21.09.2026 (частично): Tab перепрыгивает `)`/`]`-цепочки (tab-stop сниппетов `sqrt(`/`^()` с мат-клавиатуры); иначе — штатная навигация фокуса.
- [x] Холст не лагает на 100+ блоках? — done 21.09.2026 (частично): движок — перф-тест на 300 блоков (холодный в бюджете + повтор кэш-хит) + dirty-recalc + виртуализация `VIRTUALIZE_AT=250`; ручной замер рендера остался бэклогом.
- [x] Подстановка значений видна в выводе (Calcpad-тест)? — было: `substLatex` в инлайн-результате (`expr = subst = result`).
- [x] Подсветка переменной по всему листу при наведении (SMath-фича)? — done 21.09.2026: `hoveredVar` в сторе + `src/lib/varHighlight.ts`.
- [x] Статус расчёта + время + ошибки всегда видны (SMath calc time / Prime status bar)? — done 21.09.2026: `StatusBar` (состояние, ошибки, блоки, переменные, мс, сетка).
- [x] Плот из 2 серий через `;` + PNG-экспорт в 2 клика (Excel-тест: не уносим данные в Excel)? — было: мультисерии `;` + PNG(×2)/CSV-экспорт в `PlotBlockView`.
- [x] Фокус виден с клавиатуры, статус не только цветом, reduced-motion уважается? — было: глобальные `:focus-visible`-кольца, текстовые статусы (`StatusBar`, `StaleChip`), `prefers-reduced-motion` в CSS/Canvas.
- [x] Тёмная тема читаема (контраст)? — done 21.09.2026: авто-аудит `src/theme.contrast.test.ts` (текст AA 4.5 на sheet/input/chrome, легенда/тики 4.5, серии 3.0); подняты faint/danger/ok/accent в 11 темах + сериях nord/solarized.
- [x] Print/PDF выглядит как отчёт? — done 21.09.2026 (частично): шапка отчёта `NyaMath · дата · блоки/ошибки` через `beforeprint` (`fillPrintHead`); номера страниц — штатные браузерные (поля `@page: 0` их убирают осознанно).
- [x] Ошибка объясняет, как чинить, на RU/EN? — done 21.09.2026 (частично): `did-you-mean` для неопределённых переменных (`suggestName` + тесты); use-before-def подсказка была.

---

_Источники — ссылки в разделе 0 + треды/форумы, перечисленные по ходу. Скриншоты смотреть по ссылкам-первоисточникам (официальные хелпы/сайты живут дольше всего)._
