import { useEffect, useRef, useState } from 'react';
import MenuBar from './components/MenuBar';
import Canvas from './components/Canvas';
import WelcomeModal from './components/WelcomeModal';
import FunctionPalette from './components/FunctionPalette';
import { useCanvasStore } from './store/canvasStore';
import { saveDocument } from './lib/saveDocument';
import { installPrintCleanup } from './lib/print';
import { clearShareParamFromUrl, decodeShareParam, readLangFromUrl, readShareParamFromUrl, readTemplateFromUrl } from './lib/share';
import { t } from './i18n';

export default function App() {
  const theme = useCanvasStore((s) => s.theme);
  const lang = useCanvasStore((s) => s.lang);
  const blocks = useCanvasStore((s) => s.blocks);
  const loadDocument = useCanvasStore((s) => s.loadDocument);
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const paletteMode = useCanvasStore((s) => s.paletteMode);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [welcomeForced, setWelcomeForced] = useState(false);
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
      {/* рабочая зона: док-панели по бокам на всю высоту + холст */}
      <div className="nya-workspace flex-1 flex flex-row min-h-0 min-w-0">
        {paletteOpen && paletteMode === 'left' && <FunctionPalette />}
        <div className="flex-1 relative flex flex-col min-h-0 min-w-0">
          <Canvas />
        </div>
        {paletteOpen && paletteMode === 'right' && <FunctionPalette />}
      </div>
      {/* плавающая палитра — окно поверх всего, не часть canvas */}
      {paletteOpen && paletteMode === 'float' && <FunctionPalette />}
      {showWelcome && <WelcomeModal onClose={closeWelcome} onOpenFile={() => fileRef.current?.click()} />}
    </div>
  );
}
