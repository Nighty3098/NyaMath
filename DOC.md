# DOC.md — Ресёрч аналогов NyaMath: чем довольны / чем недовольны

> Дата: 19.09.2026. Объект: NyaMath — инженерный лист в браузере: формулы как на бумаге (`x := 5`, `f(x) := ...`, trailing `=`), live-пересчёт сверху-вниз, units, 2D/3D-графики, program-блоки (`if/for/while`), ODE/FDTD, infinite canvas, share-ссылка без бэкенда.
> Метод: G2 / Capterra / Trustpilot / App Store / Google Play отзывы, Reddit (r/engineering, r/StructuralEngineering, r/matlab, r/math, r/learnpython, r/Julia), PTC Community, SMath Forum, Hacker News, Engineering.com, CalcTree/IndustrialMonitor сравнения, официальные доки. В скобках `(тех.: ...)` — пометки для инженера-программиста (как это устроено / что это значит для нас).

Охват: 18 позиций — от прямых клонов Mathcad-парадигмы до смежных ниш (CAS, численные среды, notebook'и, граф-калькуляторы, решатели-«шпаргалки», плоттеры для статей).

Прямые аналоги (whiteboard «живой лист»): **1. PTC Mathcad Prime / 15, 2. SMath Studio, 3. Calcpad / CalcpadCE, 4. Maple Flow, 5. CalcTree, 6. fxSolver**.
Тяжёлый CAS/символика: **7. Wolfram Mathematica, 8. Maple (классический), 9. Maxima/wxMaxima, 10. SageMath/CoCalc**.
Численные среды: **11. MATLAB (+Live Editor), 12. GNU Octave, 13. Scilab/Xcos, 14. Julia + Pluto.jl / Quarto**.
Notebook/Web-Python: **15. Jupyter / JupyterLab / Google Colab / Kaggle**.
Визуал/обучение: **16. Desmos Studio, 17. GeoGebra**.
«Домашка за 5 секунд»: **18. Symbolab / Photomath / Microsoft Math Solver / Mathway / WolframAlpha**.
Плоты/публикации + карманные: **19. OriginPro / LabPlot / SciDAVis, 20. HiPER Calc / RealCalc / Numbat / Soulver**.

---

## ЧАСТЬ 1. Чем люди ДОВОЛЬНЫ (программа: плюсы)

### 1. PTC Mathcad Prime (и legacy Mathcad 15)
- Живая нотация «как в учебнике»: `:=` присваивание, `=` вывод, единицы в строке (тех.: WYSIWYG-редактор регионов; у нас это math-блоки + KaTeX-рендер).
- Units intelligence: `10 m * 2 = 20 m`, нельзя сложить `m + kg`, автопересчёт `N·m ↔ lbf·ft`, `Pa/bar/psi` (тех.: размерный анализ поверх numeric engine; у нас — mathjs units + `defunit`, надо держать словарь + кастомные системы как в Prime 11).
- Документ = отчёт: текст + формулы + графики + картинки в одном листе, шаблоны для проектных записок, header/footer, save to PDF (тех.: постраничная модель, print CSS; нам relevant для File → Print/PDF).
- Solve Blocks, root/ODE/PDE-солверы, символьное ядро (numeric + symbolic engines), матрицы, оптимизация min/max (тех.: два движка; у нас пока один mathjs + свои RK4/RK45/TR-BDF2 — это честно слабее, но легче).
- Интеграции: Excel-компонент (двусторонний), Creo/Windchill, API, с Prime 10–11 — Advanced Controls (listbox/slider/checkbox) + Python-скриптинг вместо VBScript/JScript (тех.: встраиваемый Python рантайм для кастом-контролов; нам — задел под program-блоки + MCP).
- Ручной режим пересчёта Calculate Now в Prime 11 (только видимые регионы) — хвалят за большие листы (тех.: инкрементальный/ленивый пересчёт по DAG зависимостей + dirty-флаги; у нас пока full recalc сверху-вниз — взять на заметку).

### 2. SMath Studio
- «Mathcad 15, но бесплатно и 2 МБ»: paper-like лист, лёгкий, portable, стартует мгновенно (тех.: C#/.NET, один exe, `.sm` = XML, `.smz` = zip-XML; нам урок — держать бандл маленьким, JSON-документ человекочитаемым).
- Dynamic Assistant + autocomplete переменных/функций/единиц (F12-подсказки) — самая хвалимая фича бывшими mathcad'овцами (тех.: префиксное дерево scope + fuzzy match; нам сделать обязательно).
- Значимые цифры (significant digits), а не только decimal places; подсветка переменной по всему листу при наведении; `:=` один оператор без лишнего `←`; Range = Vector (тех.: опции форматирования числа `format: significant vs fixed`; семантика scope).
- Плагины через Extensions Manager: X-Y Plot plugin (лучше штатных), WaterSteamPro/CoolProp таблицы, импорт `.mcd/.xmcd/.mcdx` (тех.: хост + интерфейс IPlugin/Region; нам аналог — npm-плагины для plot-функций и импорта).
- 43 языка интерфейса, локализованные имена функций/единиц; работает на Windows/Linux/Mono, Android/iOS/UWP, viewer в AutoCAD (тех.: resx-словари + отделение locale от ядра).
- Форум, где отвечает сам автор (Андрей Ивашов) — «живая поддержка» как фича (социальный плюс, нам — держать Discord/GitHub Discussions).

### 3. Calcpad (+ форк CalcpadCE, open-source с 03.2026)
- Текстовый ввод → красивый HTML-отчёт с подстановкой значений (`a = 5; F = m·a = 10 N`) — идеально для стройрасчётов и экспертизы (тех.: парсер в RPN/postfix + генератор HTML; у нас это math-блок с `=` и preview-подстановкой — совпадает).
- Авто-формы ввода: поставил `?` в коде — получил HTML-форму для заказчика без кода (тех.: директива `?` → `<input>` binding; нам — прямой аналог slider-блоков + `#pre/#post/#hide/#show` видимости).
- Экспорт в Word `.docx` через MathType-объекты, печать из браузера, вставка HTML/CSS/SVG/картинок/таблиц прямо в комментариях в кавычках (тех.: отчет = DOM, не canvas; нам — держать plot-экспорт PNG/CSV + print CSS).
- Весит мало, синтаксис учится за час, есть cloud IDE + desktop + библиотека готовых worksheets (балки, ЖБ-колонны, теплотехника) (тех.: `.cpd` plain-text + `.cpdz` binary; library = git-репо примеров — у нас `#t=ex20` share-ссылки + JSON).
- CalcpadCE хвалят за realtime-рендер, анимации через `for`-фреймы + `setInterval`, FEA-примеры (плоское напряжение, 8-DOF элементы), double-slit wave на гриде (тех.: код слева → SVG/canvas справа; у нас это program-блоки + plot/plot3d — паритет).

### 4. Maple Flow (Maplesoft, на движке Maple)
- Свободный canvas «как салфетка»: таскай регионы куда хочешь, в отличие от жёсткого листа Prime (тех.: absolute-позиционирование + свободный порядок вычисления по зависимостям, а не по `y`; нам — наш `y`-порядок проще и предсказуемее, но Flow хвалят именно за свободу).
- Лучший в классе символьный движок: гибрид symbolic-numeric, можно не задавать численные значения (тех.: ядро Maple, ~5000 функций; у нас mathjs symbolic очень ограничен — честно фиксируем отставание).
- AI Formula Assistant (поиск формул естественным языком), Variables palette, autocomplete, Table of Contents автосборка (тех.: LLM поверх индекса help + AST-палитра scope; нам — MCP `nya_evaluate/scope` уже даёт половину).
- Units без «мусорных коэффициентов», фазоры для комплексных (электрики в восторге), инженерные пакеты Signal/Thermo/DynamicSystems (тех.: units как тип с размерностью + display-style phasor `|Z|∠φ`).
- Migration Assistant `.xmcd → Flow`, запуск листа как функции из Excel/другого листа/API, генерация C/Python/MATLAB-кода, поддержка <1 дня (тех.: transpiler AST→target; нам — `nya_save/open` + share-ссылки проще, но кодогенерации нет — бэклог).

### 5. CalcTree (новая web-альтернатива Mathcad, 2025–2026)
- Хвалят за то, чего нет у бесплатных: realtime-коллаборация 2+ инженеров, версионность, шаринг без `.sm`-файлов по почте, AI-генерация черновика расчёта по стандарту + AI-ревью (тех.: CRDT/OT для коллаба + LLM c RAG по нормам; нам — Live Sync SSE `/events+/push` уже половина пути, AI — через MCP).
- Смешанная парадигма на одном листе: мат-нотация + Python (тех.: два интерпретатора в одном scope с бриджем типов; у нас program-блоки — зародыш этого).
- Markdown import/export, шаблоны по стандартам, понятная позиция по секьюрности/provenance для корпоративного IT (тех.: SOC2/регион данных; нам — serverless share `#d=` без бэкенда как козырь приватности).

### 6. fxSolver (DE, free web)
- Библиотека тысяч готовых формул по физике/инженерии: вбил значения → Solve, связал переменные между формулами, построил plot из list-значений (тех.: формула = функция с мета-инпутов; линковка = общий scope; нам — библиотека examples как MVP этого).
- Не надо ничего ставить, шаринг формулой-ссылкой, десктоп-версия лучше мобильной но обе free (тех.: чистый web-front + solver на JS).

### 7. Wolfram Mathematica (+ Wolfram Language, 7000 функций)
- «Всё в одном и всё сочетается»: символьное + численное + ML + image/audio + гео-данные + Knowledgebase из коробки (тех.: терм-рерайтинг + функц. парадигма, curated data; у нас — узкий scope, но зато zero-friction).
- Notebook = текст + код + динамика + Manipulate-слайдеры в одном документе, публикационное качество графиков, cloud/desktop гибрид (тех.: notebook JSON + CDF; Manipulate = reactive binding; у нас slider-блоки — тот же паттерн, только проще).
- Help-документация — лучшая на рынке по отзывам + бесплатные курсы (Elementary Intro to WL), natural language input как «костыли» для новичков (тех.: NL→WL парсер; нам — держать RU/EN lenient-ошибки как уже делаем).
- Home-лицензия дёшево при смене работы, интеграция с C++/Python, GPU/параллелизм из коробки.

### 8. Классический Maple
- Clickable Math: сложные операции без синтаксиса, tutors/task templates пошагово, Math Apps для прекалкулуса/статистики (тех.: GUI-визарды поверх CAS-команд; нам — dynamic assistant той же идеи).
- Лёгкий по CPU vs MATLAB, студенческая лицензия ~$75 (дешевле калькулятора), MapleCloud/MaplePrimes комьюнити (тех.: оптимизированное ядро + облачный шеринг сниппетов).

### 9. Maxima / wxMaxima (GPL CAS на Common Lisp, наследник DOE-MACSYMA)
- Бесплатный CAS с символьными матрицами, рядами Лорана, Laplace, ODE — «лучший open-source CAS» по SourceForge (тех.: Lisp-ядро + gnuplot; wxMaxima = cells как в Mathematica notebook).
- Emacs-фронтенд для гиков + Jupyter-kernel (`maxima-jupyter`), Sage использует Maxima внутри (тех.: CAS как движок за GUI/вебом — нам урок декомпозиции engine/UI).

### 10. SageMath + CoCalc (SageCell)
- Цель — «бесплатный Magma/Maple/Mathematica/Matlab» на Python-клее (NumPy/SciPy/SymPy/Maxima/GAP/FLINT/R под одним зонтом) + прозрачность (open-source, виден каждый шаг) (тех.: Python как glue + Cython для скорости; нам — mathjs как клей, но Python-экосистема шире).
- CoCalc: коллаборация realtime + TimeTravel (история), курс-менеджмент с nbgrader, LaTeX/Markdown/терминал/X11 в одном проекте, `.ipynb`-совместимость без лок-ина (тех.: OT + снапшоты; нам — undo/redo + Live Sync зародыш этого).

### 11. MATLAB (+ Live Editor, Simulink)
- Тулбоксы под всё (circuits/drivetrains/thermal/battery/ML), отладчик — «почему MATLAB в 2025» по MathWorks-дискуссии, 2D/3D/histogram-плоты одной строкой, Simulink для динамики (тех.: JIT + BLAS/LAPACK/MKL + собственный ODE-солверный стек; у нас RK4/RK45/TR-BDF2 — мини-версия).
- Онлайн-курсы MathWorks хвалят даже не-математики, поддержка отвечает быстро, интеграция с Python/C++ (тех.: LMS + техподдержка как часть продукта).

### 12. GNU Octave
- Почти 1:1 синтаксис MATLAB, запускает `.m`-файлы без правок, читает/пишет `.mat`, 30+ лет в академии, free (тех.: интерпретатор + совместимый парсер; нам — урок совместимости: уметь читать чужой формат = рост).
- Исходники открыты — можно дебажить/патчить выравнивание памяти (128-bit пример с форума) (тех.: FOSS как фича для НИИ).

### 13. Scilab (+ Xcos)
- Хвалят IDE из коробки: редактор с подсветкой, variable browser, help с примерами, GUI-билдер, Xcos = бесплатный Simulink (тех.: Scilab-язык + Xcos dataflow-граф; нам — program-блоки + симуляции RK/FDTD как аналог Xcos-лайт).
- MATLAB→Scilab транслятор `mfile2sci`, коммерческие аддоны (Equalis) для instrument control (тех.: transpiler как мост миграции).

### 14. Julia + Pluto.jl (+ Quarto/Typst)
- Скорость C при удобстве Python (LLVM JIT + multiple dispatch), `@bind`-слайдеры + реактивность «как spreadsheet»: поменял ячейку — пересчиталось всё зависимое, нет hidden state (тех.: статический анализ зависимостей между cells → DAG пересчёта; у нас top-to-bottom `y` — проще, но реактивный DAG Pluto — идеал для будущего).
- Ноутбук = чистый `.jl`-файл (дружит с git), встроенный пакетник с пиннингом версий в файле → воспроизводимость (тех.: manifest в header; нам — JSON + share-ссылки уже reproducible, но пинить версию движка стоит).
- MIT-курсы на Pluto, Handcalcs.jl для подстановки чисел в формулы как в Calcpad (тех.: макросы поверх AST).

### 15. Jupyter / JupyterLab / Google Colab / Kaggle
- Zero-setup в браузере (Colab), free GPU/TPU для ML, шаринг как Google Docs с комментариями к ячейке, Drive/GitHub-интеграция, preinstalled TF/PyTorch (тех.: hosted Jupyter + container runtime 12h/12GB free tier; `.ipynb` JSON — наш JSON-формат идеологически тот же).
- Markdown + код + картинки в одном месте, 40+ ядер (Python/R/Julia), nbconvert → HTML/PDF, ReviewNB-диффы для ревью (тех.: kernel-протокол ZMQ + cell-модель; нам — MCP как аналог kernel-протокола для агентов).

### 16. Desmos Studio (Graphing/Scientific/3D/Geometry)
- Самый быстрый старт: вбил `y=x^2`, двигаешь слайдер — график живёт, цвета/анимации/звук графика (accessibility), работает офлайн на телефоне (тех.: собственный быстрый плоттер на canvas/WebGL + парсер формул; у нас plot-автопревью — та же идея, надо держать <16ms).
- Teacher.desmos активности + студенческие шаблоны, регрессии/таблицы, parametric/piecewise/inequalities из коробки (тех.: activity-builder поверх граф-ядра).
- Обожают за «не надо учить»: on-screen клавиатура с `π/√/≤`, projector mode для класса (тех.: UX без меню — нам держать math-клавиатуру/палитру).

### 17. GeoGebra (Classic/CAS/3D/Geometry)
- 100M+ учителей/школьников: геометрия + алгебра + CAS + статистика + 3D в одном, drag-and-drop точек, tube.geogebra.org共享, LMS-интеграции, 80+ языков (тех.: Java/HTML5 гибрид, CAS-ядро + DGS-движок; нам — связка plot+geometry как бэклог).
- CAS-калькулятор решает/раскладывает/интегрирует точно, Math Solver по фото с шагами (тех.: exact rational engine поверх numeric).

### 18. Symbolab / Photomath / Microsoft Math Solver / Mathway / WolframAlpha (+Pro)
- Step-by-step как репетитор: не ответ, а путь (500+ калькуляторов у Symbolab: limits/integral/ODE/Laplace/series), камера-ввод рукописного, word problems (тех.: CAS + дерево шагов + NL-парсер; нам — lenient-ошибки + `=` с промежуточными уже половина, шагов не хватает — бэклог).
- Microsoft Math Solver — полностью free без paywall (спонсируется экосистемой), Symbolab free-tier щедрее Photomath, WolframAlpha — curated data + plots + alternate forms + 2x/3x computation time в Pro (тех.: freemium-лестница Basic/Pro/Premium; нам — serverless = free forever как козырь).
- Графинг у Symbolab заменяет TI-84 (интерактивнее стрелок), Problem Generator даёт бесконечные задачи с автопроверкой (тех.: генератор задач = параметризованные шаблоны + checker).

### 19. OriginPro / LabPlot / SciDAVis
- Publication-quality плоты в 2 клика из Excel-copy-paste, 100+ типов, multi-axis/multi-panel, curve/surface/peak fitting, SPC/DOE/ANOVA из коробки, EMF-экспорт в Illustrator без артефактов, batch-анализ без кода (тех.: worksheet-matrix-graph модель + LabTalk-скрипты; у нас PNG/CSV-экспорт — минимум, надо дотягивать стили).
- Поддержка отвечает быстро, Viewer бесплатен для шеринга `.opj` (тех.: viewer как read-only share — наш `#d=`-линк круче, т.к. интерактивен).

### 20. HiPER Calc / Numbat / Soulver (карманные)
- HiPER (4.7★, 260K отзывов, 10M+ скачиваний): 100 знаков мантиссы, дроби/периодические, SI-префиксы, hex/oct/bin, матрицы/статистика/3D-графики, history на планшете, темы — «лучше физического калькулятора» (тех.: Decimal big-precision + парсер с приоритетом ops; нам — точность mathjs double vs arbitrary — зафиксировать).
- Numbat (open-source, Apache-2.0): units из коробки в терминале/вебе — гики в восторге (тех.: Rust + unit-type system; нам — пример идеального units-UX).
- Soulver: «калькулятор с текстом» — пишешь словами, получаешь ответ (тех.: NL+units hybrid; нам — text-блоки + math в одном canvas уже близко).

---

## ЧАСТЬ 2. Чем люди НЕДОВОЛЬНЫ (программа: жалобы/боли)

### 1. PTC Mathcad Prime
- Цена/лицензирование — топ-жалоба: подписка ~£3k/год, процедура получения лицензии меняется каждый релиз, license.dat/MAC-привязка, Express после триала превращается в тыкву с вотермаркой (тех.: node-locked + license server; нам — serverless без лицензий как антитеза).
- Миграция 15→Prime — «апгрейд-даунгрейд»: ground-up rewrite потерял фичи (текстовые стили, дефолтные unit-системы, нормальные плоты с подписями/сеткой), конвертер сыпет ошибками на листах сложнее hello-world, фирмы отдавали миграцию интерну на лето (тех.: `.mcd` binary → `.mcdx` XML несовместимы; урок — версионировать формат + держать migrator + не ломать backward compat).
- Тормоза: 10MB data-import `READTEXT` 5 мин vs 30 сек в 15-ке, фризы при переключении окон/нескольких листах, медленный скролл (тех.: WPF-рендер + full recalc всего листа на каждое изменение до Prime 11; нам — виртуализация canvas + инкрементальный пересчёт).
- Мелочи, бесящие экспертов: сабскрипты в 2 клика (было в 1), нельзя припарковать палиtry, ribbon вместо палитр, нет code-style `if` для больших программ, плоты «бедные» — люди уносят данные в Excel ради приличного графика (тех.: UX-регрессии при rewrite; нам — держать keyboard-first ввод `[]`, `_`, `;` для серий).
- Установка/активация: changing procedure, offline-страхи про cloud-лицензии («интернет лёг — дедлайн сорван»), retired single-user не может оплатить без PO/wire (тех.: DX лицензирования хуже, чем DX продукта).

### 2. SMath Studio
- UI «из 2008»: жёлтый фон Mathcad-15, Mono-костыль на macOS/Linux (ощущение «Windows в костюме»), нет выравнивания регионов по сетке из коробки (тех.: WinForms + Mono; нам — современный React+Tailwind уже выигрыш).
- Плагинный ад: поиск через форум, версии/зависимости не матчатся, шаринг `.sm` без гарантии что у получателя те же плагины (тех.: нет lockfile/manifest; нам — пинить версии в JSON + share-линк со slim-tuples).
- Нет realtime-коллаба, нет Python-фолбэка (one paradigm only), нет cloud`а кроме Viewer (тех.: desktop-only архитектура; нам — Live Sync + program-блоки закрывают).
- Single Instance по дефолту с 0.99 (второй файл — вкладкой, а не окном) лечится только `SingleInstance=0` в `settings.inf` в `%APPDATA%` — неочевидно (тех.: UX-дефолт ломает power-users).
- Баги ядра по мелочам: `augment/stack` со скалярами, `norme()` с protected-memory на Win7, таблицы со stub`ами, enterprise-фичи ушли во freemium/Enterprise-отдельно; + compliance-боль 2025–2026: RU-origin → баны в корпоративном IT (тех.: provenance как риск; нам — указать юрисдикцию/лицензию явно).
- Нет нативной ARM/macOS-сборки, мобильные версии слабее десктопа.

### 3. Calcpad / CalcpadCE
- Текстовый синтаксис, а не WYSIWYG: порог входа для mathcad-привыкших («пишешь код, а не формулы»), кавычки для текста путают (тех.: code-style DSL vs math-AST редактор; у нас math-блоки ближе к бумаге — преимущество, держать).
- Маленькая библиотека vs SMath/Mathcad, нет символьного движка уровня Maple (тех.: numeric-only + численные методы root/integral/diff; у нас та же дыра — честно).
- Нет кастомных тем/стилей (палитра захардкожена), только Windows 10/11 + .NET 10 для desktop, закрытие исходников в 03.2026 раскололо комьюнити (форк CE) (тех.: vendor lock-in страх; нам — MIT/открытость как ответ).
- Web-viewer read-only, нет совместного редактирования, нет AI.

### 4. Maple Flow
- Цена как у Mathcad (дорого для студентов/инди), десктоп-ориентация, web-deploy обещан «позже в 2025.2» (тех.: subscription/perpetual путаница; нам — free web как козырь).
- Flow-специфика беднее классического Maple (часть пакетов не проброшена), мигратор `.xmcd` не идеален на сложных листах.
- Ribbon-интерфейс + табличная вёрстка для «красивых» отчётов — power-users ворчат про line-oriented UX (тех.: layout engine слабее TeX/Word).

### 5. CalcTree (идеологический конкурент)
- Жалобы короткие: free-tier обрезан (AI-кап), vendor lock-in (данные в облаке), цена team-плана для маленьких фирм, нет offline/desktop (тех.: cloud-only; наш serverless+offline — контрпозиция).
- Один парадигм-упрёк в обратную сторону: «слишком много магии AI, хочу deterministic расчёт для экспертизы» (тех.: AI-nondeterminism vs auditable numeric core — нам держать ядро детерминированным, AI только через MCP снаружи).

### 6. fxSolver
- Устаревший UI, мобильная версия хуже десктопа, нет units-awareness уровня Mathcad, нет программного слоя (loops/functions ограничены), библиотека «чёрный ящик» без версионирования формул (тех.: jQuery-era front; нам — современный плоттер + program-блоки выигрывают).

### 7. Wolfram Mathematica
- Цена x2–5 от конкурентов + cloud только по подписке, нет free-tier для бизнеса (можно стартовать бизнес на Python-ноутбуке, на WL — нет по лицензии) (тех.: proprietary + license server; нам — free forever).
- Кривая обучения: свой язык (term-rewriting/functional), `[[ ]]`, `@`, `/@` пугают после Python/MATLAB; standalone `.exe`/Docker-публикация — боль (тех.: DSL lock-in; у нас `sin(x)`, `:=` — ближе к школе).
- No-autosave в notebook (теряли часы работы), медленные вычисления на больших данных vs специализированные (тех.: интерпретатор vs JIT/BLAS; нам — честно показывать время расчёта как SMath).
- HN-боль: «chicken-egg» — в вузах нет лицензий → нет спроса → не учат → нет лицензий; проприетарность без open-source в эпоху Python/Julia (тех.: distribution model проигрывает экосистеме).

### 8. Классический Maple
- Trustpilot 2.3: краши и порча файлов («double-edged sword»), зависание на `permute(55)` с убийством процесса, interrupt не работает (тех.: ядро без preemptive cancel + слабая изоляция; нам — воркер с timeout/cancel + автосейв).
- Синтаксис `with(LinearAlgebra)`-пакеты vs Mathematica «просто пиши» — новички путаются; маленькое комьюнити vs MATLAB; GUI без dark mode, редизайн просят годами (тех.: package-loader UX; нам — все функции из коробки без `with`).
- Цена для индивидуалов, хотя дешевле MATLAB.

### 9. Maxima / wxMaxima
- HN-критика: «элементарное неверно, слабый simplify/интегралы, падает на тривиальных уравнениях, медленный» (спорно, но повторяется), asksign-вопросы в консоли (тех.: старый simplify + интерактивные вопросы без headless-режима; нам — lenient-ошибки без вопросов).
- Сборка wxMaxima из исходников — «дни фиксов» (нужен бинарник Ubuntu), M1-Mac не поддерживался долго, gnuplot-плоты через файлы (пустой envelope при ошибке чтения) (тех.: Lisp-toolchain + external plotter IPC; нам — встроенный canvas/WebGL без IPC).
- Документация 800+ страниц без картинок, Frenglish-остатки, UI текстовый в ядре (тех.: DX 90-х).

### 10. SageMath / CoCalc
- Установка Sage локально — «боль» (гигабайты, зависимости), запуск медленный, интерфейс перегружен (тех.: монолит + сборка всего мира; нам — npm i + vite за секунды).
- CoCalc free-tier тормозит (троттлинг CPU/RAM), realtime-коллаб иногда конфликтует на больших `.ipynb`, pricing on-prem через sales (тех.: shared containers vs dedicated; нам — local-first без сервера).
- Sage Worksheet → Jupyter конвертация не 1:1, версионирование окружений для студентов сложно без Docker (тех.: env-drift; нам — пинить версию движка в документе).

### 11. MATLAB
- Цена: $940+/год/seat, тулбоксы ×$2000+, student/home перевели на подписку (тех.: perpetual убит; нам — free).
- Проприетарность: нельзя посмотреть исходник солвера (black box для науки), лицензионный сервер в air-gap — боль, organisational-use трактовка home-лицензии пугает аспирантов (тех.: compliance/аудит; нам — reproducible JSON + открытый парсер).
- Язык 1-индекс, медленные циклы без векторизации, `.m`-легаси, Live Scripts тяжелее `.m` для git-диффов (тех.: JIT помогает, но семантика старая; нам — JSON diff-friendly + slim-tuples).
- Запуск тяжёлый, установка гигабайты, online-courses хороши, но без лицензии бесполезны.

### 12. GNU Octave
- Нет тулбоксов MATLAB (Simulink,Deep Learning,Optimization полноценных нет), GUI беднее, плоты «острее, но проще», perf ниже на MKL-задачах (тех.: RefBLAS/OpenBLAS vs Intel MKL; нам — не гнаться за BLAS, честно позиционировать scope).
- Совместимость ~95%, но edge-кейсы (классы/packages, новые функции) ломаются; instrument control/GUI-builder слабее Scilab (тех.: parser-совместимость без runtime-паритета).

### 13. Scilab / Xcos
- Синтаксис не MATLAB (`%pi`, `xgrid`, `Plot2d`), `mfile2sci` не переводит `xlim` и др. — ручная доводка (тех.: dialect friction; нам — держать `sin/cos/pi` без `%`).
- Xcos беднее Simulink (solver-стек, codegen, HIL), документация местами Frenglish, перф на 1024×1024 гридах упирается (тех.: numeric core слабее MKL; нам — downsampling `max_points` как уже делаем).
- Маленькое комьюнити, commercial-аддоны через третьих лиц.

### 14. Julia + Pluto.jl
- Time-to-first-plot (TTFP): JIT-компиляция — первый плот секунды/десятки секунд, `--trim` экспериментален (тех.: LLVM warmup; у нас mathjs стартует мгновенно — преимущество для «калькуляторного» UX).
- Pluto-реактивность с правилом «переменная — один раз» ломает привычный императивный стиль; `Distributed` не поддерживается (#300), `@async` реактивно не обновляет, cloud-шеринг только через свой сервер/Binder 6–7 мин spin-up (тех.: single-assignment DAG vs mutable workspace; нам — `y`-порядок понятнее студенту).
- Экосистема меньше Python (библиотеки сырые, breaking между минорами до 1.0), VS Code-экстеншн + пакеты тянут бинарники (тех.: Pkg-риски; нам — zero-deps plot).
- Quarto vs Pluto vs BonitoBook — фрагментация («что выбрать для статьи с кодом?»), Discourse-споры без консенсуса.

### 15. Jupyter / Colab / Kaggle
- Hidden state + out-of-order execution — главная научная критика: лишь ~24% ноутбуков выполняются без ошибок, ~4% воспроизводят те же результаты (PMC-исследование 863K ноутбуков); `In[17]→In[15]→пропуск 30` — классика (тех.: mutable kernel store + любая ячейка в любой момент; Pluto/FlowBook фиксит DAG'ом; нам — строгий top-to-bottom + cycle detection как ответ).
- Colab free: 12h timeout, 12GB RAM, нет persistent storage (файлы трутся), GPU не гарантирован в пик, переустановка пакетов каждую сессию, нет SSH, Drive-mount трётся при шеринге (тех.: preemptible containers; нам — local-first без таймаутов).
- Jupyter локально: `pip/conda`-ад, окружения расползаются (`requirements.txt` нет в 70% репо), `git`-дифф `.ipynb` нечитаем (JSON с outputs/base64), падения на больших датасетах, disappearing cells баг в Lab 4.3.1 (тех.: формат с outputs в git — нам хранить slim без previews, как уже в `/snapshot`).
- Секьюрность: Colab на серверах Google — нельзя для confidential data без enterprise; versioning только через Revision history (слабее git).

### 16. Desmos
- Не CAS: нет символьного diff/integral (только численно), нет сохранения графов в app-версии (раньше), user-графы с сайта не грузятся в app, нет units, нет документов-отчётов (тех.: graphing kernel, не algebra; нам — units + program-слой как отстройка).
- Для вуза «слишком просто»: нет матриц-символьно, ODE, программирования; учителя жалуются на «игрушечность» для старших курсов.
- FIPPA/GDPR: облачные сохранения требуют аккаунтов — школам нельзя без CA-серверов.

### 17. GeoGebra
- App Store 4.3: «graphing flawless, ease of use terrible» — слишком много шагов ради простого, UI не self-explanatory, на iPad нет login/save (критичный отзыв 2021), кривые через AI-подсказки, аппроксимация с резкими заломами (тех.: tool-based UX vs command-line; нам — командная строка + палитра, а не 50 иконок).
- Раздробленность: 6 приложений (Graphing/Geometry/3D/CAS/Solver) вместо одного — путает (тех.: product sprawl; нам — один canvas со всеми kinds).
- CAS слабее Mathematica/Maple, 3D беднее Desmos-3D/Blender, offline-синк капризен.

### 18. Symbolab / Photomath / Microsoft Math Solver / Mathway / WolframAlpha
- Paywall-боль: Symbolab показывает ответ free, шаги — $1/нед–$2.99/мес; Photomath прячет «объяснения» в Plus; Mathway $9.99/мес самый дорогой; WolframAlpha Pro $5–8.25/мес + лимит 2–5MB upload (тех.: freemium-воронка; нам — шаговый решатель free как дифференциатор, если сделаем).
- Качество шагов: Photomath скипает логические прыжки, Symbolab «месиво» на векторах (отзыв «plenty of steps, messy»), MS Solver краток до дыр, FX-Calc крашится на сложных интегралах без сети (тех.: template-шаги vs real derivation; нам — показывать подстановку значений как Calcpad — уже лучше тишины).
- Клавиатура Symbolab после редизайна 2021 — «верните старую», нет preview перед оплатой («дай одно решение бесплатно оценить стиль»), отмена подписки через текстовую страницу без кнопки (тех.: UX-монетизация бьёт retention).
- Читинг-морализм: WIRED «WolframAlpha = untraceable cheat», преподы банят; ввод только по одному примеру, системы уравнений с трудом; privacy: сбор данных + ads (TechRadar минус за data collection).
- WolframAlpha: требует точной фразы («Super Bowl scores → Romanian» мем), TechRadar «unclear pro tools», примеры data-analysis не работают без Pro.

### 19. OriginPro / LabPlot
- Цена: дорого для индивидуала/студента без гранта («plots like Python, but university won't buy»), Pro-фичи (Peak/Surface/Stats) только в Pro (тех.: tiered licensing; LabPlot free, но беднее).
- Кривая обучения: «Not User-Friendly (4), Complexity (3)» на G2, скрипты OriginPro слабее JMP/Python (тех.: LabTalk vs Python; нам — JS/программные блоки понятнее).
- Стиль плотов «из 90-х» (отзыв Capterra), curve fitting не даёт задать exact form/coeffs, совместимость `.opj` только через Viewer, только Windows полноценно (тех.: GDI-рендер legacy; нам — SVG/canvas + темы).
- LabPlot/SciDAVis: меньше шаблонов, меньше peak/stats-пакетов, баги импорта Excel, мало туториалов.

### 20. HiPER Calc / RealCalc / Numbat / Soulver (карманные)
- HiPER free: ads + consent 500+ third parties (AdMob) → «instant removal» (отзыв 2026), popups/tutorials при старте даже в Pro, смена раскладки клавиатуры без спроса (конвертер уехал на long-press `2`), `1+(1/9^(4^42))` → «Result is too big» (тех.: double vs big-decimal пределы + Ad SDK; нам — без рекламы как принцип).
- Нет документов/шаринга/units-системы уровня Mathcad, только «одна строка» (тех.: calculator, не worksheet; нам — canvas как надмножество).
- Numbat/Soulver: нет графиков/матриц/ODE, нишевые (терминал/Mac-only), мало локализаций.

---

## Выводы для NyaMath (что взять / чего избегать)

1. **Держать paper-like ввод как в Mathcad/SMath, но без их грехов:** keyboard-first (`:=`, trailing `=`, `;` для серий, `_` для сабскриптов в 1 кейстрок), Dynamic Assistant как в SMath (fuzzy по scope+units), significant-digits форматирование. (тех.: парсер mathjs + свой препроцессор `:=/=/j/..`, KaTeX-рендер, scope-палитра).
2. **Units — священны:** размерный анализ + кастомные `defunit` + пресеты систем (SI/US/CGS) как в Prime 11, display в phasor/exponential/complex-threshold. Нельзя складывать `m+kg` — с lenient RU/EN-ошибкой.
3. **Пересчёт — строгий top-to-bottom по `y` + DAG + cycle detection (уже есть), next step — инкрементальный dirty-recalc видимых регионов (Calculate Now из Prime 11) + воркер с cancel/timeout (урок Maple-крашей) + показ времени расчёта (как SMath).**
4. **Плоты — не отдавать Excel/Origin:** автопревью у math-блоков + полноценные plot/plot3d (multi-series `;`, polar/bar/stem, contour/surface/points/matrix) + PNG/CSV экспорт + темы (урок «бедных плотов Prime» и «стиля 90-х Origin»). Держать `max_points` downsampling (урок Scilab 1024²).
5. **Отчётность как в Calcpad:** подстановка значений в выводе, `#pre/#post/#hide/#show`, печать/PDF без бэкенда, share-линк `#d=` (slim tuples → dict → deflate-raw → base64url) + `#t=ex` для примеров. Это уже сильнее SMath-шаринга `.sm`-файлами и cloud-only CalcTree.
6. **Program-блоки + ODE/FDTD — наш Xcos-лайт:** step-debugger хвалят в SMath (embedded debugger), нам держать + добавить breakpoints/watch. Не пытаться догнать Mathematica/Maple символьно — честно позиционировать numeric+инженерные пакеты.
7. **Коллаба: Live Sync (SSE `/events`, `POST /push`, `rev` last-writer-wins) — довести до CRDT-уровня CalcTree/CoCalc (TimeTravel/история), но держать local-first + offline (контрпозиция Colab-таймаутам и cloud-лицензиям PTC).**
8. **Не повторять:** подписки/ license.dat/ вотермарки (PTC), Mono-legacy UI (SMath), code-only DSL без WYSIWYG (Calcpad), hidden state ноутбуков (Jupyter — только 4% reproducible), TTFP-джит (Julia), 500-третьих-партий ads (HiPER), paywall шагов (Symbolab), потерю файлов (Mathematica no-autosave, Maple corrupt) → автосейв + JSON + undo/redo уже есть, добавить snapshots.
9. **Документация и onboarding как продукт:** Mathematica-help + Maple-tutors + Desmos-activities как ориентир; держать примеры variant20/advanced + встроенный reference book (как SMath) + RU/EN.
10. **Provenance/лицензия явно:** указать лицензию и юрисдикцию (урок бана SMath в enterprise IT), держать формат открытым и версионированным (урок `.mcd→.mcdx` боли), migrator для чужих форматов (хотя бы `.sm`/`.cpd` импорт как бэклог).

---

## Что у нас УЖЕ реализовано (честно по коду, стек: React + TS + Vite, mathjs, KaTeX, three.js, zustand, MCP на Node)

> Проверка по `src/engine/*`, `src/components/*`, `src/store/*`, `src/lib/*`, `README.md`. Пишу только то, что реально есть, без маркетинга.

### Ядро-лист (Mathcad-парадигма)
- Math-блоки: `x := 5`, `f(x) := sin(x)`, trailing `=` вывод, `j` как мнимая единица (`3+4j`, `Re/Im`), матрицы `[1, 2; 3, 4]`, диапазоны `1..10` / `0,0.5..2`, lenient RU/EN-ошибки (тех.: `src/engine/mathEngine.ts` — кастомный evaluator поверх `mathjs.create(all)`, препроцессоры `preprocessJ/preprocessRanges`, `humanizeMathError`).
- Строгий порядок сверху-вниз по `y`, зависимости + детект циклов, Disabled-регионы (не считаются, имена не видны ниже) (тех.: `dependencies.ts` + `recalculateAll`, DAG по `extractDependencies`, `definedVar`).
- Кэши горячего пути: parse/compile/deps/LaTeX по строке с LRU-2000, кэш разбора program-блоков (тех.: `compiledPreCache/plotExprCache/depsCache`, отдача копий массивов; задел под инкрементальный пересчёт).
- Units через mathjs + `defunit`/`convertTo`/`inUnits`/`hasUnit`, `m/s`, `GHz`, `mm`, `ohm`, `degC` (тех.: unit-type с размерностью; кастомных систем SI/US/CGS-пресетов как в Prime 11 пока нет — только поштучные `defunit`).

### Паки/домены (то, чем обычно хвастаются Maple/Matlab)
- ~150 функций в `PACK_NAMES` (`packs.ts`, ~2770 строк, чистый клиентский JS, zero-latency): `seq/linspace`, статистика, `nlsolve/find/minerr/minimize/maximize/root/bvp` (Ньютон с численной якобианой + демпфирование, Брент, Нелдер–Мид в `numeric.ts`), `ndiff/nint/nsum/nprod`, `lsolve/polyroots/linfit/polyfit`, `taylor/limit/numgrad` (+ Лопиталь-тесты), `dft/idft`, `eigen/rankMat/condNum`, `erf/normpdf/normcdf/binom/poisson`, интерполяция/трапеции.
- Телеком/ЭМ: `dB/dBm/lambda_f/fspl`, `skinDepth/waveImp/propConst/coaxCap/coaxInd/microstripZ/wgCutoff/friisPr/sMag2db`, Bode-пакет `bodeH/bodeMagDb/bodePhaseDeg/bodeFreqs/bode` (тех.: то, за что любят MATLAB toolboxes — у нас мини-версия без MKL).
- Физика/материалы/неопределённость: CODATA-2022 константы (`constants.ts` с тестом-привязкой), справочник материалов (`materials.ts`: `sigma/rho/eps_r/mu_r/alpha/ct/cp/bandgap`), GUM-блок `uMean/uRect/uTri/uComb/kCov/uExpand/uMC` (Монте-Карло до 100k) + МИ/ПМГ/5725/21748 (`pmgRSS/repLim/prec5725/uTopDown`) (тех.: уникально vs SMath/Calcpad — нормативка ГОСТ в палитре с подписью `doc`).
- Бит/цифра: `dec2bin/bitand/shl/rol/crc16/crc32/lfsrSeq/adcSNR/shannonCap` и строки `chrU/splitStr/parseNum/histC` (тех.: задел под courses по ЦОС/вычтеху).

### Program-блоки и симуляции (наш Xcos-лайт)
- Program: `x :=`, `if/else if/else/end`, `for i in вектор/матрица/a..b/n`, `while` (лимиты 100k/2000 строк), `break/continue/return/assert/trace/breakpoint`, `on error запасное`, `exportName` наружу, локальный scope (глобалы только чтение) (тех.: `program.ts`, свой построчный интерпретатор поверх скомпилированных `EvalFunction`, не `eval`).
- Step-debugger + `programTrace`, точки останова (тех.: `ProgramBlockView.tsx`; SMath-урок embedded debugger — у нас уже есть база).
- Sim-движок (`simEngine.ts`, ~1380 строк): `euler/rk4/rk45/trbdf2`, events (`cond` + actions + `stop`), aux-пересчёт каждый шаг, FDTD 1D-волна (до 1000 ячеек/8000 шагов, слои `eps`, gauss/sine-источник), лимиты честности вместо тихой деградации, ~15 готовых моделей (projectile/pendulum/Lorenz/doublepend/orbit/RLC/LC/duffing/Van-der-Pol/RC) (тех.: выражения — обычный синтаксис mathEngine, видят scope выше + `t`).

### Графики (Desmos/Origin-уроки учтены частично)
- 2D plot-блоки: мультисерии через `;`, `xy/polar`, `line/bar/stem`, полоса ошибок `plotErr`, `logx`, title/labels/grid/legend, единицы осей `plotXUnit/plotYUnit`, автопревью у math-блоков + `MiniPlot`, даунсэмплинг `max_points` (тех.: `plotSample.ts`, canvas/SVG, stride-сэмплинг как ответ Scilab-тормозам).
- Contour + plot3d на three.js: `surface/points/matrix/auto`, разрешение сетки, wireframe, `plot3dSample.ts` (тех.: WebGL вместо gnuplot-IPC как у Maxima — нет внешних процессов).
- Экспорт PNG (из SVG)/CSV (`exportFiles.ts`, `columnsToCsv`), копирование в буфер, печать/PDF через `print.ts` + print-CSS (тех.: всё клиентское, без сервера; до Word `.docx`/MathType как у Calcpad не дотягиваем).

### Канвас/UX/документ
- Infinite canvas (`Canvas.tsx` + `canvasLayout.ts` + `useRegionDrag.ts` + `dragGhost.ts`): drag, мультивыделение рамкой/Shift, ручной размер `w/h`, прилипание/сетка, undo/redo, темы (с тестом `theme.test.ts`), RU/EN (`i18n.ts`), тёмная/светлая уже есть.
- Палитры: Unified (функции + формулы + константы), вставка сниппетов с `vars` выше plot-блока (порядок соблюдается), `FunctionPalette/VariableNavigator/ScopeMonitor/DetachedTabWindow` (тех.: zustand-стор `canvasStore.ts` ~1300 строк, localStorage-автосейв `nyamath-doc-v1`).
- Слайдеры (`slider`-блоки: `sliderVar/Min/Max/Step/Val` → живой пересчёт), text-блоки (Markdown-лайт + HTML?), KaTeX-рендер формул + LaTeX-paste (`latexPaste.test.ts`).
- Файлы: save/open JSON (валидация + миграция), share-ссылки serverless `#d=` (slim-кортежи `[dy,kind,main,extra]` → фразовый словарь `sharePhrases.ts` → deflate-raw → base64url, `&lang=`) + `#t=ex20/demo` для нетронутых примеров (тех.: `share.ts` 577 строк, нативный `CompressionStream`, zero-deps; сильнее SMath `.sm`-по-почте и cloud-only CalcTree).
- MCP + Live Sync: 17 инструментов (`nya_status/list/get/add/update/move/resize/remove/clear/evaluate/scope/plot_data/plot3d_data/open/save/load_example/recalc/ask/answer`), ресурс `nya://document`, SSE `GET /events`, `POST /push`, `GET /snapshot|/status`, `rev` monotonic last-writer-wins, echo-suppression по контенту, debounce 400мс, undo не засоряется (тех.: `mcp/src/*` + `lib/liveSync.ts`; это наш ответ CalcTree-AI и CoCalc-коллабу, только local-first).

---

## Что НУЖНО реализовать (разбивка: МОЖНО в нашем стеке / НЕЛЬЗЯ или нецелесообразно)

### A. МОЖНО (браузерный JS/TS, без бэкенда, силами 1–2 дев + MCP-агент)

**A1. UX-мелочи с большим выхлопом (1–3 дня каждая)**
- Dynamic Assistant как в SMath: autocomplete по scope + fuzzy + F12-подсказки единиц/функций (тех.: `scopeVars.ts` + `useDocScope.ts` уже дают scope; добавить trie + показ сигнатур из `funcDoc.ts`).
- Significant digits vs fixed decimals + экспоненциальный порог + phasor-вид `|Z|∠φ` (тех.: опция `formatResult`, не трогает ядро).
- Показ времени расчёта блока + общий индикатор «грязных» регионов (тех.: `performance.now()` вокруг `recalculateAll`, SMath-урок).
- Сабскрипты в 1 кейстрок (`_`/`[]`), `;` для серий уже есть — добавить хоткеи из Prime-жалоб (припаркованные палитры, ribbon → keyboard-first).
- [x] Подстановка значений в выводе Calcpad-стиля: `F = m·a = 2·5 = 10 N` (тех.: рендер AST с `plainScope`; у нас `resultStr/resultLatex` уже есть — дорисовать substitution-строку). ✅ Готово 19.09.2026: `buildSubstitution()` в `src/engine/mathEngine.ts` (AST-трансформация SymbolNode→константа, только скаляры число/bool/Unit/Complex, скобки для отрицательных, пропуск имён функций и строковых аргументов, fail-safe сверкой значения), scope-снимок до последней строки + поля `substStr/substLatex` в `src/engine/dependencies.ts`, цепочка `expr = subst = result` в `MathBlockView.tsx`, `subst` в MCP `nya_list_blocks`, тесты `src/engine/subst.test.ts` (19 шт).
- Видимость `#pre/#post/#hide/#show` + режим «Отчёт» (чистый вывод без кода) для экспертизы (тех.: флаг на блоке + print-CSS фильтр; Calcpad-урок).

**A2. Ядро и надёжность (1–2 недели)**
- Web Worker + cancel/timeout + async-пересчёт (тех.: `recalculateAllAsync` уже начат + `recalcAsync.test.ts`; вынести mathjs в `Worker`, `AbortController` как ответ Maple-зависаниям на `permute(55)`).
- Инкрементальный dirty-recalc: пересчитывать только зависимых ниже + видимые (Calculate Now из Prime 11) (тех.: DAG уже есть — добавить dirty-флаги + `IntersectionObserver` видимости; виртуализация canvas для 10MB-листов).
- Автосейв-снапшоты/TimeTravel (тех.: стек JSON-снапшотов поверх undo/redo + localStorage ротация; ответ Mathematica no-autosave и Maple-corrupt).
- Пресеты unit-систем SI/US/CGS + строгий размерный контроль с понятными ошибками (тех.: словарь поверх mathjs units; Prime 11-урок).
- Шаговый вывод решателей: показывать итерации `nlsolve/root/nint` и подстановки (тех.: лог из `numeric.ts` в `programTrace`-стиле; ответ Symbolab-Paywall — у нас free).

**A3. Импорт/экспорт/совместимость (по 3–7 дней)**
- Импортёры `.sm` (XML) → наш JSON и `.cpd` (plain-text) → math/text/program-блоки; экспорт `.docx` через `docx` npm + MathML→OMML (тех.: чистый парсинг в браузере, без сервера; закрывает PTC-боль `.mcd→.mcdx` хотя бы для SMath/Calcpad).
- Excel двусторонний: импорт CSV/XLSX (SheetJS) в матрицы + экспорт scope → XLSX (тех.: Mathcad-урок Excel-компонента; в браузере реально).
- Markdown import/export + LaTeX-экспорт документа (тех.: `report.ts` уже генерирует отчёт — допилить до `.md/.tex`).

**A4. Коллаборация и агент (наш козырь vs CalcTree/CoCalc)**
- Yjs-CRDT поверх Live Sync (сейчас LWW `rev`) + курс-режим (раздача `#t=` + сбор решений через `nya_get_scope`) (тех.: `yjs` + существующие `/events|/push`; offline-first сохраняется).
- MCP-доработки: `nya_diff` (git-friendly diff slim-JSON), `nya_import` (вставка `.sm/.cpd`), пин версии движка в документе для reproducibility (Pluto-урок manifest в header).
- Библиотека шаблонов по ГОСТ/курсам (балки, цепи, допуски) как fxSolver-library, но версионированная в git (тех.: `src/data/formulas.ts` + share-ссылки).

**A5. Плоты и мобильность (по 1–2 недели)**
- Стили Origin-уровня для статей: serif-тиicks, экспорт SVG/EMF без артефактов, темизация плотов под тему app (тех.: SVG-рендер уже есть — добавить stylesheet + `plotTitle` пресеты).
- PWA + offline + touch-палитра (Desmos-урок on-screen клавиатуры `π/√/≤`) + планшетный history-lane как у HiPER (тех.: `vite-plugin-pwa` + `manifest`, без смены стека).
- Малая FEA-демо (плоская рама 8-DOF как у CalcpadCE) поверх program-блоков — реально в JS до ~10k DOF (тех.: `solveLinear` уже есть; дальше — sparse в WASM).

**A6. Среднее (возможно, но дорого: 1–2 месяца)**
- Pyodide-WASM Python-блок (Advanced Controls из Prime 11: слайдеры/таблицы на Python) (тех.: `pyodide` ~10MB WASM + async-мост scope↔Python; стартует медленно — держать опциональным чанком, не в base-бандле).
- OCR-ввод с фото (Tesseract.js) + handwriting (тех.: WASM-OCR в браузере работает, но точность ниже Photomath-native; только как nice-to-have).
- Tauri/Capacitor-десктоп/мобилка из того же React-кода для air-gap enterprise (тех.: стек не меняется, но отдельный пайплайн подписи/автообновлений).

### B. НЕЛЬЗЯ / нецелесообразно в текущем стеке (нужен другой рантайм, натив или бэкенд)

- **Полный CAS уровня Mathematica/Maple (symbolic PDE, `simplify` без дыр, exact domains).** Почему нет (тех.: mathjs symbolic — игрушка vs ядро на C/Lisp с 40 годами правил; свой CAS = годы; Maxima-в-WASM (Common Lisp → Emscripten) весит сотни МБ и тормозит в разы; разумный максимум — дотянуть `simplify/sderiv/expand/sfactor` + честно писать «numeric-first»).
- **MATLAB-производительность (MKL/BLAS, 10k×10k матрицы, Deep Learning Toolbox, Simulink codegen/HIL).** Почему нет (тех.: в браузере нет Intel MKL/CUDA, только `Float64Array` + single-thread JS + GC-паузы; WebGPU ограничен и не даёт cuDNN; большие гриды как Scilab 1024² — только с даунсэмплингом, что мы и делаем `max_points`).
- **Realtime hard-deadline/FDTD на миллионах ячеек, 3D FEM как Ansys/COMSOL.** Почему нет (тех.: JS event loop без детерминизма, RAM вкладки ~2–4GB, нет MPI; наш FDTD-лимит 1000×8000 — честный потолок; больше — только нативный бэкенд + WASM+threads, это отдельный продукт).
- **Arbitrary precision 100 знаков как HiPER без потери скорости.** Почему нет (тех.: `decimal.js/bignumber` в 10–100× медленнее double + ломают mathjs-тип `Unit`; держать double + честный `uncRound/resRound` для метрологии вместо big-decimal).
- **Нативные интеграции (Creo/Windchill COM, AutoCAD-viewer, VISA-приборы, GDI-EMF 1:1).** Почему нет (тех.: браузерная песочница без COM/USB-raw; нужен Tauri/Node-addon или отдельный коннектор; в web — только через наш MCP-мост снаружи).
- **Free Cloud GPU/TPU как Colab/Kaggle (12h, 12GB, preinstalled TF).** Почему нет без бэкенда (тех.: serverless `#d=` принципиально без сервера; GPU только локальный WebGPU; cloud — это счета + abuse-policy, противоречит free-forever позиционированию).
- **Локальный сильный AI-ассистент (RAG по ГОСТам, генерация расчётов offline).** Почему нет (тех.: WebLLM-модели в браузере — GB веса + слабый reasoning vs серверный LLM; наш путь — AI снаружи через MCP (`nya_ask/answer`, `nya_evaluate/scope`), ядро остаётся детерминированным и аудитируемым для экспертизы — это и есть ответ CalcTree-магии).
- **Enterprise air-gap SSO/license-server как у PTC (floating licenses, audit).** Почему не хотим (тех.: это фича, а не баг, что у нас её нет — serverless без phone-home проходит restrictive-IT лучше подписок; делать license-server = предать преимущество; для enterprise достаточно provenance/лицензии + SBOM + offline-PWA).

*Источники (выборочно): PTC Mathcad Prime G2/Capterra/Community (slow threads, licensing, Prime vs 15 CalcTree/Eng-Tips), SMath smath.com/reviews + Forum + Wiki SMath vs Mathcad + CNET, Calcpad calcpad.eu/.net + CESDb 4.9/114 + CalcpadCE fork 03.2026, Maplesoft compare/mathcad + Engineering.com Maple Flow review + Trustpilot Maple 2.3, Wolfram mathematica/capterra + Community + HN 31929221 + TechRadar WolframAlpha, MathWorks Central + Gartner + RunMat pricing 2026, Octave/Scilab UMBC papers + EDN + G2, Jupyter PMC 8106381 + ReviewNB + Colab docs/pricing, Pluto.jl GitHub/discourse/juliacon, SageMath/CoCalc docs/GitHub, Desmos/GeoGebra CommonSense/AppStore/pressbooks, Symbolab/AppStore 26K 4.6 + Photomath-complaints + MS Solver comparisons, OriginLab G2/Capterra 197 4.8, HiPER Play 260K 4.7/Pro 38K 4.8, AlternativeTo/fxSolver/Hackaday.*
