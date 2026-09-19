import { useEffect, useRef, useState } from 'react';
import MenuBar from './components/MenuBar';
import Canvas from './components/Canvas';
import StatusBar from './components/StatusBar';
import ScopeMonitor from './components/ScopeMonitor';
import WelcomeModal from './components/WelcomeModal';
import FunctionPalette from './components/FunctionPalette';
import VariableNavigator from './components/VariableNavigator';
import { savePaletteUi, useCanvasStore } from './store/canvasStore';
import { saveDocument } from './lib/saveDocument';
import { installPrintCleanup } from './lib/print';
import { clearShareParamFromUrl, decodeShareParam, readLangFromUrl, readShareParamFromUrl, readTemplateFromUrl } from './lib/share';
import { t } from './i18n';

/** Док-зона слева/справа: палитры пристыкованы на всю высоту стороны.
 *  Общая ширина зоны — ресайзер меняет ширину всего стека одинаково. */
function DockZone({ side }: { side: 'left' | 'right' }) {
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const paletteMode = useCanvasStore((s) => s.paletteMode);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const formulaPaletteMode = useCanvasStore((s) => s.formulaPaletteMode);
  const constPaletteOpen = useCanvasStore((s) => s.constPaletteOpen);
  const constPaletteMode = useCanvasStore((s) => s.constPaletteMode);
  const full = side === 'left' ? 'left' : 'right';
  const hasFuncs = paletteOpen && paletteMode === full;
  const hasForms = formulaPaletteOpen && formulaPaletteMode === full;
  const hasConsts = constPaletteOpen && constPaletteMode === full;
  if (!hasFuncs && !hasForms && !hasConsts) return null;
  return (
    <DockZoneInner
      side={side}
      hasFuncs={hasFuncs}
      hasForms={hasForms}
      hasConsts={hasConsts}
    />
  );
}

function DockZoneInner({
  side,
  hasFuncs,
  hasForms,
  hasConsts,
}: {
  side: 'left' | 'right';
  hasFuncs: boolean;
  hasForms: boolean;
  hasConsts: boolean;
}) {
  const setPaletteDockW = useCanvasStore((s) => s.setPaletteDockW);
  const setFormulaPaletteDockW = useCanvasStore((s) => s.setFormulaPaletteDockW);
  const setConstPaletteDockW = useCanvasStore((s) => s.setConstPaletteDockW);
  const dockW = useCanvasStore((s) => s.paletteDockW);
  const formulaDockW = useCanvasStore((s) => s.formulaPaletteDockW);
  const constDockW = useCanvasStore((s) => s.constPaletteDockW);
  const zoneW = Math.max(hasFuncs ? dockW : 0, hasForms ? formulaDockW : 0, hasConsts ? constDockW : 0);
  const dockResizeRef = useRef<{ start: number; size: number } | null>(null);

  const resize = (w: number) => {
    const nw = Math.min(640, Math.max(280, Math.round(w)));
    if (hasFuncs) setPaletteDockW(nw);
    if (hasForms) setFormulaPaletteDockW(nw);
    if (hasConsts) setConstPaletteDockW(nw);
  };

  const gutter = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('pal.resize')}
      title={t('pal.resize')}
      className="w-[7px] shrink-0 cursor-ew-resize hover:bg-white/10 active:bg-white/15 touch-none"
      onPointerDown={(e) => {
        dockResizeRef.current = { start: e.clientX, size: zoneW };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const st = dockResizeRef.current;
        if (!st) return;
        const dx = e.clientX - st.start;
        resize(st.size + (side === 'left' ? dx : -dx));
      }}
      onPointerUp={() => {
        dockResizeRef.current = null;
        if (hasFuncs) savePaletteUi();
        if (hasForms) savePaletteUi('formulas');
        if (hasConsts) savePaletteUi('constants');
      }}
      onPointerCancel={() => {
        dockResizeRef.current = null;
      }}
    />
  );

  return (
    <div
      className={`h-full shrink-0 flex items-stretch bg-[var(--chrome)] text-[var(--chrome-ink)] ${
        side === 'left' ? 'border-r' : 'border-l'
      } border-[var(--chrome-line)]`}
      style={{ width: zoneW }}
      role="complementary"
      aria-label={
        side === 'left'
          ? [hasFuncs ? t('pal.aria') : '', hasForms ? t('formulaPal.aria') : '', hasConsts ? t('constPal.aria') : ''].filter(Boolean).join(' · ')
          : [hasForms ? t('formulaPal.aria') : '', hasFuncs ? t('pal.aria') : '', hasConsts ? t('constPal.aria') : ''].filter(Boolean).join(' · ')
      }
    >
      {side === 'right' && gutter}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {hasFuncs && <FunctionPalette />}
        {hasForms && <FunctionPalette variant="formulas" />}
        {hasConsts && <FunctionPalette variant="constants" />}
      </div>
      {side === 'left' && gutter}
    </div>
  );
}

export default function App() {
  const theme = useCanvasStore((s) => s.theme);
  const lang = useCanvasStore((s) => s.lang);
  const blocks = useCanvasStore((s) => s.blocks);
  const loadDocument = useCanvasStore((s) => s.loadDocument);
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const paletteMode = useCanvasStore((s) => s.paletteMode);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const formulaPaletteMode = useCanvasStore((s) => s.formulaPaletteMode);
  const constPaletteOpen = useCanvasStore((s) => s.constPaletteOpen);
  const constPaletteMode = useCanvasStore((s) => s.constPaletteMode);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [welcomeForced, setWelcomeForced] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const scopeMonOpen = useCanvasStore((s) => s.scopeMonOpen);
  const fileRef = useRef<HTMLInputElement>(null);

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
        void saveDocument(useCanvasStore.getState().blocks);
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

  // Входящая share-ссылка: `&lang=` применяем сразу (и в localStorage),
  // `#t=…` (пример) или `#d=…` (данные) — грузим лист, справку не показываем.
  const [shareIncoming, setShareIncoming] = useState(
    () => readTemplateFromUrl() !== null || readShareParamFromUrl() !== null,
  );
  useEffect(() => {
    const incomingLang = readLangFromUrl();
    if (incomingLang) useCanvasStore.getState().setLang(incomingLang);
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
        const r = useCanvasStore.getState().loadDocument(data);
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

  const openFile = (f: File) => {
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
  };

  const closeWelcome = () => {
    setWelcomeForced(false);
    setWelcomeDismissed(true);
  };
  const showWelcome = welcomeForced || (!welcomeDismissed && !shareIncoming && Object.keys(blocks).length === 0);

  return (
    <div className="nya-app h-screen w-screen flex flex-col overflow-hidden">
      <MenuBar
        onOpenFile={() => fileRef.current?.click()}
        onShowWelcome={() => setWelcomeForced(true)}
        onOpenNavigator={() => setNavigatorOpen(true)}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openFile(f);
          e.target.value = '';
        }}
      />
      {/* рабочая зона: док-зоны по бокам (стек палитр) + холст */}
      <div className="nya-workspace flex-1 flex flex-row min-h-0 min-w-0">
        <DockZone side="left" />
        <div className="flex-1 relative flex flex-col min-h-0 min-w-0">
          <Canvas />
        </div>
        {scopeMonOpen && <ScopeMonitor />}
        <DockZone side="right" />
      </div>
      <StatusBar />
      {/* плавающие палитры — окна поверх всего, не часть canvas */}
      {paletteOpen && paletteMode === 'float' && <FunctionPalette />}
      {formulaPaletteOpen && formulaPaletteMode === 'float' && <FunctionPalette variant="formulas" />}
      {constPaletteOpen && constPaletteMode === 'float' && <FunctionPalette variant="constants" />}
      {/* Ctrl+K: навигатор переменных листа */}
      {navigatorOpen && <VariableNavigator onClose={() => setNavigatorOpen(false)} />}
      {showWelcome && <WelcomeModal onClose={closeWelcome} onOpenFile={() => fileRef.current?.click()} />}
    </div>
  );
}
