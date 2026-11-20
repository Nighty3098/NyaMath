import { useCallback, useEffect, useRef, useState } from 'react';
import MenuBar from './components/MenuBar';
import Canvas from './components/Canvas';
import ProblemsPanel from './components/ProblemsPanel';
import StatusBar from './components/StatusBar';
import WelcomeModal from './components/WelcomeModal';
import UnifiedPalette from './components/UnifiedPalette';
import DetachedTabWindow from './components/DetachedTabWindow';
import VariableNavigator from './components/VariableNavigator';
import { useCanvasStore, type PaletteTab } from './store/canvasStore';
import { saveDocument } from './lib/saveDocument';
import { installPrintCleanup } from './lib/print';
import { parseCpd, parseSmXml, type ImportResult } from './lib/importDoc';
import { parseMathcadFile } from './lib/mathcadFile';
import { parseTable } from './lib/tableIO';
import {
  clearShareParamFromUrl,
  decodeShareParam,
  readLangFromUrl,
  readCalcPrecisionFromUrl,
  readShareParamFromUrl,
  readTemplateFromUrl,
} from './lib/share';
import { t } from './i18n';
import { trackVisitOnce } from './lib/analytics';

const DROP_EXTS = new Set([
  '.json',
  '.sm',
  '.cpd',
  '.csv',
  '.tsv',
  '.txt',
  '.xmcd',
  '.xmcdz',
  '.mcdx',
]);
const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

function notesText(notes: string[]): string {
  if (!notes.length) return '';
  const head = notes.slice(0, 12).join('\n');
  const tail = notes.length > 12 ? `\n… (+${notes.length - 12})` : '';
  return t('import.notes', { notes: head + tail });
}

export default function App() {
  const theme = useCanvasStore((s) => s.theme);
  const lang = useCanvasStore((s) => s.lang);
  const blocks = useCanvasStore((s) => s.blocks);
  const nativeMacMenu = window.nyaElectron?.platform === 'darwin';
  const loadDocument = useCanvasStore((s) => s.loadDocument);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [welcomeForced, setWelcomeForced] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // вкладки, вытянутые в отдельные окна (показываем только включённые источники)
  const detachedTabs = useCanvasStore((s) => s.detachedTabs);
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const constPaletteOpen = useCanvasStore((s) => s.constPaletteOpen);
  const elemPaletteOpen = useCanvasStore((s) => s.elemPaletteOpen);
  const scopeMonOpen = useCanvasStore((s) => s.scopeMonOpen);
  const detachedVisible = detachedTabs.filter((id: PaletteTab) =>
    id === 'functions'
      ? paletteOpen
      : id === 'formulas'
        ? formulaPaletteOpen
        : id === 'constants'
          ? constPaletteOpen
          : id === 'elements'
            ? elemPaletteOpen
            : scopeMonOpen,
  );
  // пристыкованные вынесенные вкладки живут во flex-ряду (слева/справа от холста),
  // плавающие — окнами поверх всего
  const detachedSide = useCanvasStore((s) => s.detachedSide);
  const sideOf = (id: PaletteTab): 'left' | 'right' | 'float' => detachedSide[id] ?? 'float';
  const leftDetached = detachedVisible.filter((id) => sideOf(id) === 'left');
  const rightDetached = detachedVisible.filter((id) => sideOf(id) === 'right');
  const floatDetached = detachedVisible.filter((id) => sideOf(id) === 'float');

  // Визит: один beacon на сессию в /api/hit (без секретов в клиенте).
  // Секреты Telegram живут только в env серверной функции.
  useEffect(() => {
    trackVisitOnce();
  }, []);

  // Смена темы без «смазывания»: глушим транзишены на один кадр
  useEffect(() => {
    const style = document.createElement('style');
    style.append(document.createTextNode('*,*::before,*::after{transition:none !important}'));
    document.head.append(style);
    document.documentElement.dataset.theme = theme;
    const _flush = document.body.offsetHeight;
    void _flush;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
    return () => {
      cancelAnimationFrame(raf);
      style.remove();
    };
  }, [theme]);

  // Язык интерфейса: <html lang> для скринридеров/поиска
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Глобальные шорткаты: Ctrl+S — сохранить, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — undo/redo.
  // Слушатель в capture-фазе на window: срабатывает раньше редакторов блоков.
  // e.code вместо e.key — работает в любой раскладке (KeyS = Ctrl+С в русской).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      // Ctrl+Alt+клавиша — ввод спецсимволов в некоторых раскладках, не перехватываем
      if (e.altKey) return;
      const inField =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.code === 'KeyS') {
        e.preventDefault();
        // зажатый Ctrl+S не должен спамить диалогами сохранения
        if (e.repeat) return;
        const state = useCanvasStore.getState();
        void saveDocument(state.blocks, state.calcPrecision);
      } else if (e.code === 'KeyZ' && !e.shiftKey) {
        // в поле ввода — нативный undo текста
        if (inField) return;
        e.preventDefault();
        useCanvasStore.getState().undo();
      } else if ((e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY') {
        if (inField) return;
        e.preventDefault();
        useCanvasStore.getState().redo();
      } else if (e.code === 'KeyK') {
        // Ctrl+K — навигатор переменных листа (в полях тоже работает)
        e.preventDefault();
        if (e.repeat) return;
        setNavigatorOpen((v) => !v);
      } else if (e.code === 'KeyJ') {
        // Ctrl+J — телеметрия переменных (пульт)
        e.preventDefault();
        if (e.repeat) return;
        useCanvasStore.getState().toggleScopeMon();
      } else if (e.code === 'KeyM' && e.shiftKey) {
        // Ctrl+Shift+M — панель проблем (работает и в полях)
        e.preventDefault();
        if (e.repeat) return;
        setProblemsOpen((v) => !v);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        // Ctrl+Enter — пересчитать (Thistle-паттерн ⌘⏎); в полях — нативный Enter редактора
        if (inField) return;
        e.preventDefault();
        if (e.repeat) return;
        const st = useCanvasStore.getState();
        if (st.calcMode === 'manual') st.recalcNow();
        else st.recalc();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Перед печатью коммитим открытый редактор (blur → finishEdit),
  // иначе печатается пустой textarea вместо формулы.
  // Ctrl+P / системная печать в обход меню — по умолчанию цвет темы;
  // afterprint сбрасывает data-print, чтобы ч/б не прилипал к экрану.
  useEffect(() => installPrintCleanup(), []);

  // TimeTravel: тихий автоснапшот раз в минуту (кольцо 20 в localStorage).
  useEffect(() => {
    const id = setInterval(() => {
      try {
        useCanvasStore.getState().snapshotNow(false);
      } catch {
        /* ignore */
      }
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Входящая share-ссылка: `&lang=` применяем сразу (и в localStorage),
  // `#t=…` (пример) или `#d=…` (данные) — грузим лист, справку не показываем.
  const [shareIncoming, setShareIncoming] = useState(
    () => readTemplateFromUrl() !== null || readShareParamFromUrl() !== null,
  );
  useEffect(() => {
    const incomingLang = readLangFromUrl();
    if (incomingLang) useCanvasStore.getState().setLang(incomingLang);
    const incomingPrecision = readCalcPrecisionFromUrl();
    const tpl = readTemplateFromUrl();
    if (tpl) {
      const st = useCanvasStore.getState();
      if (Object.keys(st.blocks).length > 0) {
        if (!confirm(t('share.overwrite'))) {
          clearShareParamFromUrl();
          setShareIncoming(false);
          return;
        }
      }
      if (tpl === 'ex20') st.loadTestScenario();
      else st.loadAdvancedDemo();
      if (incomingPrecision) st.setCalcPrecision(incomingPrecision);
      clearShareParamFromUrl();
      setShareIncoming(false);
      alert(t('share.loaded', { n: Object.keys(useCanvasStore.getState().blocks).length }));
      return;
    }
    const param = readShareParamFromUrl();
    if (!param) {
      setShareIncoming(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await decodeShareParam(param);
        if (cancelled) return;
        const cur = useCanvasStore.getState().blocks;
        if (Object.keys(cur).length > 0) {
          if (!confirm(t('share.loaded', { n: data.length }))) {
            clearShareParamFromUrl();
            setShareIncoming(false);
            return;
          }
        }
        const doc = incomingPrecision ? { blocks: data, calcPrecision: incomingPrecision } : data;
        const r = useCanvasStore.getState().loadDocument(doc);
        clearShareParamFromUrl();
        setShareIncoming(false);
        alert(r.ok ? t('share.loaded', { n: data.length }) : r.message);
      } catch {
        if (!cancelled) {
          clearShareParamFromUrl();
          setShareIncoming(false);
          alert(t('share.badLink'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFile = useCallback(
    (f: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          const r = loadDocument(data);
          alert(r.message);
        } catch {
          alert(t('app.badJson'));
        }
      };
      reader.readAsText(f);
    },
    [loadDocument],
  );

  /** Единая точка входа для файла — из пикера и из drag&drop. */
  const importFile = useCallback(
    async (f: File) => {
      const lc = f.name.toLowerCase();
      const ext = lc.includes('.') ? lc.slice(lc.lastIndexOf('.')) : '';
      if (ext === '.json') {
        openFile(f);
        return;
      }
      if (!DROP_EXTS.has(ext)) {
        alert(t('import.unsupported', { ext: ext || '—' }));
        return;
      }
      if (f.size > MAX_IMPORT_BYTES) {
        alert(t('import.failed', { name: f.name, error: 'file too large (>16 MB)' }));
        return;
      }
      try {
        if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
          const text = await f.text();
          const rows = parseTable(text);
          const ok = useCanvasStore.getState().importCsvMatrix(text);
          alert(ok ? t('csv.imported', { n: rows.length, m: rows[0]?.length ?? 0 }) : t('csv.failed'));
          return;
        }
        const bytes = new Uint8Array(await f.arrayBuffer());
        let parsed: ImportResult;
        if (ext === '.xmcd' || ext === '.xmcdz' || ext === '.mcdx') {
          parsed = await parseMathcadFile(bytes, f.name);
        } else {
          const text = new TextDecoder('utf-8').decode(bytes);
          parsed = ext === '.sm' ? parseSmXml(text) : parseCpd(text);
        }
        if (!parsed.blocks.length) {
          alert(t('import.empty', { notes: notesText(parsed.notes) }));
          return;
        }
        if (parsed.blocks.length > 500) {
          alert(t('import.tooMany', { n: parsed.blocks.length }));
          return;
        }
        const n = useCanvasStore.getState().appendImportedBlocks(parsed.blocks);
        alert(t('import.ok', { n, notes: notesText(parsed.notes) }));
      } catch (e) {
        alert(
          t('import.failed', { name: f.name, error: e instanceof Error ? e.message : String(e) }),
        );
      }
    },
    [openFile],
  );

  // Внешний drag&drop файлов — слушаем на window, чтобы работало поверх холста,
  // панелей и любых модальных окон. Счётчик depth гасит мерцание при переходе
  // между вложенными элементами.
  const [dragActive, setDragActive] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragActive(false);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragActive(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void importFile(f);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFile]);

  const closeWelcome = () => {
    setWelcomeForced(false);
    setWelcomeDismissed(true);
  };
  const showWelcome =
    welcomeForced || (!welcomeDismissed && !shareIncoming && Object.keys(blocks).length === 0);

  return (
    <div className="nya-app h-screen w-screen flex flex-col overflow-hidden">
      {/* шапка печатного отчёта: на экране скрыта, заполняется в beforeprint */}
      <div id="nya-print-head" className="nya-print-head" aria-hidden="true">
        <div data-ph="title" className="nya-print-title" />
        <div data-ph="sub" className="nya-print-sub" />
      </div>
      <div className={nativeMacMenu ? 'hidden' : undefined}>
        <MenuBar
          onOpenFile={() => fileRef.current?.click()}
          onShowWelcome={() => setWelcomeForced(true)}
          onOpenNavigator={() => setNavigatorOpen(true)}
          onOpenProblems={() => setProblemsOpen((v) => !v)}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.sm,.cpd,.csv,.tsv,.txt,.xmcd,.xmcdz,.mcdx,application/json,text/plain,text/csv"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      {/* рабочая зона: док-панели слева + единое окно + холст + док-панели справа */}
      <div className="nya-workspace flex-1 flex flex-row min-h-0 min-w-0">
        {leftDetached.map((tab) => (
          <DetachedTabWindow key={tab} tab={tab} onOpenNavigator={() => setNavigatorOpen(true)} />
        ))}
        <UnifiedPalette onOpenNavigator={() => setNavigatorOpen(true)} />
        <div className="flex-1 relative flex flex-col min-h-0 min-w-0" style={{ order: 2 }}>
          <Canvas />
        </div>
        {rightDetached.map((tab) => (
          <DetachedTabWindow key={tab} tab={tab} onOpenNavigator={() => setNavigatorOpen(true)} />
        ))}
      </div>
      {problemsOpen && <ProblemsPanel onClose={() => setProblemsOpen(false)} />}
      <StatusBar onOpenNavigator={() => setNavigatorOpen(true)} />
      {/* вынесенные вкладки — отдельные окна поверх всего */}
      {floatDetached.map((tab) => (
        <DetachedTabWindow key={tab} tab={tab} onOpenNavigator={() => setNavigatorOpen(true)} />
      ))}
      {/* Ctrl+K: навигатор переменных листа */}
      {navigatorOpen && <VariableNavigator onClose={() => setNavigatorOpen(false)} />}
      {dragActive && (
        <div className="nya-drop-overlay" aria-live="polite">
          <div className="nya-drop-card">
            <div className="nya-drop-title">{t('drop.active')}</div>
            <div className="nya-drop-sub">{t('drop.hint')}</div>
          </div>
        </div>
      )}
      {showWelcome && (
        <WelcomeModal onClose={closeWelcome} onOpenFile={() => fileRef.current?.click()} />
      )}
    </div>
  );
}
