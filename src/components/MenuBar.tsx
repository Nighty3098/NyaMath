import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { saveDocument } from '../lib/saveDocument';
import { printDocument } from '../lib/print';
import { downloadLatexReport, downloadMarkdown } from '../lib/report';
import { SHARE_WARN_CHARS, shareDocument } from '../lib/share';
import { THEMES } from '../theme';
import { t, themeLabel, type Lang } from '../i18n';
import { connectLive, disconnectLive, getLiveUrl, setLiveUrl, testLiveConnection } from '../lib/liveSync';
import {
  IConst, IFx, IFormula, IGrid, IOpen, IPlot, IPlot3d, IPrint, IProgram,
  IRecalc, IRedo, ISave, ISim, IUndo, IX, IZap, ISun, IMoon, ICopy, ISignal, IDemo,
} from './Icon';

interface MenuBarProps {
  onOpenFile: () => void;
  onShowWelcome: () => void;
  onOpenNavigator: () => void;
}

type Entry =
  | { sep: true }
  | { head: string }
  | {
      id: string;
      icon?: React.ReactNode;
      label: string;
      hint?: string;
      danger?: boolean;
      checked?: boolean;
      disabled?: boolean;
      action: () => void;
    };

/** Новая вставка — в точку курсора-прицела; прицел каскадом уходит вниз. */
function atCross(): { x: number; y: number } {
  const st = useCanvasStore.getState();
  const p = { x: st.cross.x, y: st.cross.y };
  st.nudgeCross(0, 140);
  return p;
}

/**
 * Минималистичный тулбар: 5 меню + сегмент быстрой вставки +
 * вынесенные undo/redo/пересчёт и тихий статус листа.
 * Клик — открыть, наведение при открытом — переключить, Esc/клик мимо — закрыть.
 */
export default function MenuBar({ onOpenFile, onShowWelcome, onOpenNavigator }: MenuBarProps) {
  const blocks = useCanvasStore((s) => s.blocks);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addContourBlock = useCanvasStore((s) => s.addContourBlock);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const addSimBlock = useCanvasStore((s) => s.addSimBlock);
  const addSliderBlock = useCanvasStore((s) => s.addSliderBlock);
  const loadTestScenario = useCanvasStore((s) => s.loadTestScenario);
  const loadAdvancedDemo = useCanvasStore((s) => s.loadAdvancedDemo);
  const clear = useCanvasStore((s) => s.clear);
  const recalc = useCanvasStore((s) => s.recalc);
  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const togglePalette = useCanvasStore((s) => s.togglePalette);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const toggleFormulaPalette = useCanvasStore((s) => s.toggleFormulaPalette);
  const constPaletteOpen = useCanvasStore((s) => s.constPaletteOpen);
  const toggleConstPalette = useCanvasStore((s) => s.toggleConstPalette);
  const liveConnected = useCanvasStore((s) => s.liveConnected);
  const liveError = useCanvasStore((s) => s.liveError);
  const theme = useCanvasStore((s) => s.theme);
  const setTheme = useCanvasStore((s) => s.setTheme);
  const toggleTheme = useCanvasStore((s) => s.toggleTheme);
  const lang = useCanvasStore((s) => s.lang);
  const setLang = useCanvasStore((s) => s.setLang);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.past.length > 0);
  const canRedo = useCanvasStore((s) => s.future.length > 0);

  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarW, setToolbarW] = useState(0);

  // Точное центрирование меню по окну: левый «отголосок» повторяет ширину
  // правого блока (быстрые действия), чтобы меню стояло строго по центру.
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setToolbarW(el.offsetWidth));
    ro.observe(el);
    setToolbarW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(null);
    fn();
  };

  /** Live-синхронизация с MCP-сервисом: вкл — спросить URL один раз, выкл — разрыв. */
  const toggleLive = () => {
    const st = useCanvasStore.getState();
    if (st.liveConnected) {
      disconnectLive();
      return;
    }
    const cur = getLiveUrl();
    const url = window.prompt(t('live.urlPrompt'), cur)?.trim() || cur;
    // сначала проверяем сервис обычным запросом — иначе молча висим на битой SSE
    void testLiveConnection(url).then((r) => {
      if (!r.ok) {
        alert(t('live.checkFail', { url, error: r.error ?? '?' }));
        return;
      }
      setLiveUrl(url);
      connectLive();
    });
  };

  /** Поделиться: JSON → slim → фразы → deflate → base64url → ссылка в буфере (+язык). */
  const shareCurrentSheet = async () => {
    const cur = useCanvasStore.getState().blocks;
    if (!Object.keys(cur).length) {
      alert(t('share.empty'));
      return;
    }
    try {
      const r = await shareDocument(cur, useCanvasStore.getState().lang);
      const warn = r.urlLength > SHARE_WARN_CHARS ? t('share.longWarn', { chars: r.urlLength }) : '';
      if (r.copied) alert(t('share.copied', { n: r.count, chars: r.urlLength }) + warn);
      else prompt(t('share.copyManual', { n: r.count, chars: r.urlLength, url: '' }), r.url);
    } catch {
      alert(t('share.failed'));
    }
  };

  const langEntry = (id: string, l: Lang, label: string): Entry => ({
    id,
    label,
    checked: lang === l,
    action: run(() => setLang(l)),
  });

  const insertAt = (fn: (x: number, y: number) => void) => () => {
    const p = atCross();
    fn(p.x, p.y);
  };

  const menus: { id: string; label: string; alignRight?: boolean; items: Entry[] }[] = [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { id: 'save', icon: <ISave />, label: t('menu.save'), hint: 'Ctrl+S', action: run(() => void saveDocument(blocks)) },
        { id: 'open', icon: <IOpen />, label: t('menu.open'), action: run(onOpenFile) },
        { id: 'share', icon: <ICopy />, label: t('menu.share'), action: run(() => void shareCurrentSheet()) },
        { sep: true },
        { id: 'print-color', icon: <IPrint />, label: t('menu.printColor'), hint: 'Ctrl+P', action: run(() => printDocument('color')) },
        { id: 'print-bw', icon: <IPrint />, label: t('menu.printBw'), action: run(() => printDocument('bw')) },
        { id: 'export-md', icon: <ICopy />, label: t('menu.exportMd'), action: run(() => downloadMarkdown(blocks)) },
        { id: 'export-tex', icon: <ICopy />, label: t('menu.exportTex'), action: run(() => downloadLatexReport(blocks)) },
        { sep: true },
        { id: 'clear', icon: <IX />, label: t('menu.clear'), danger: true, action: run(() => { if (confirm(t('confirm.clear'))) clear(); }) },
      ],
    },
    {
      id: 'insert',
      label: t('menu.insert'),
      items: [
        { id: 'ins-math', icon: <IFormula />, label: t('menu.insMath'), action: run(insertAt((x, y) => addBlock(x, y))) },
        { id: 'ins-plot', icon: <IPlot />, label: t('menu.insPlot'), action: run(insertAt((x, y) => addPlotBlock(x, y))) },
        { id: 'ins-contour', icon: <IPlot />, label: t('menu.insContour'), action: run(insertAt((x, y) => addContourBlock(x, y))) },
        { id: 'ins-3d', icon: <IPlot3d />, label: t('menu.ins3d'), action: run(insertAt((x, y) => addPlot3dBlock(x, y))) },
        { id: 'ins-prog', icon: <IProgram />, label: t('menu.insProg'), action: run(insertAt((x, y) => addProgramBlock(x, y))) },
        { id: 'ins-slider', icon: <ISignal />, label: t('menu.insSlider'), action: run(insertAt((x, y) => addSliderBlock(x, y))) },
        { id: 'ins-sim', icon: <ISim />, label: t('menu.insSim'), action: run(insertAt((x, y) => addSimBlock(x, y))) },
        { sep: true },
        { id: 'ins-pal', icon: <IFx />, label: t('menu.insPal'), hint: 'ƒx', action: run(togglePalette) },
        { id: 'ins-fpal', icon: <IFormula />, label: t('menu.insFormulaPal'), hint: '∑', action: run(toggleFormulaPalette) },
        { id: 'ins-cpal', icon: <IConst />, label: t('menu.insConstPal'), hint: '∞', action: run(toggleConstPalette) },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        { id: 'grid', icon: <IGrid />, label: t('menu.grid'), checked: showGrid, action: run(toggleGrid) },
        { id: 'palette', icon: <IFx />, label: t('menu.palette'), checked: paletteOpen, action: run(togglePalette) },
        { id: 'fpalette', icon: <IFormula />, label: t('menu.formulaPalette'), checked: formulaPaletteOpen, action: run(toggleFormulaPalette) },
        { id: 'cpalette', icon: <IConst />, label: t('menu.constPalette'), checked: constPaletteOpen, action: run(toggleConstPalette) },
        { id: 'live', icon: <ISignal />, label: t('menu.liveSync'), checked: liveConnected, action: run(toggleLive) },
        { id: 'recalc', icon: <IRecalc />, label: t('menu.recalc'), hint: 'Ctrl+↵', action: run(recalc) },
        { id: 'variables', icon: <IFx />, label: t('menu.variables'), hint: 'Ctrl+K', action: run(onOpenNavigator) },
        { sep: true },
        ...THEMES.map((th) => ({
          id: `theme-${th.id}`,
          icon: (th.kind === 'light' ? <ISun /> : <IMoon />) as React.ReactNode,
          label: themeLabel(th.id),
          checked: theme === th.id,
          action: run(() => setTheme(th.id)),
        })),
        { sep: true },
        langEntry('lang-ru', 'ru', 'Русский'),
        langEntry('lang-en', 'en', 'English'),
      ],
    },
    {
      id: 'examples',
      label: t('menu.examples'),
      items: [
        { id: 'ex20', icon: <IZap />, label: t('menu.ex20'), action: run(loadTestScenario) },
        { id: 'exdemo', icon: <IDemo />, label: t('menu.exdemo'), action: run(loadAdvancedDemo) },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      alignRight: true,
      items: [
        { id: 'welcome', label: t('menu.welcome'), action: run(onShowWelcome) },
      ],
    },
  ];

  const renderItem = (it: Entry, i: number, onPick: () => void, tall = false) => {
    if ('sep' in it) return <div key={`sep${i}`} className="menu-sep" role="separator" />;
    if ('head' in it) return <div key={`h${i}`} className="menu-head">{it.head}</div>;
    return (
      <button
        key={it.id}
        type="button"
        role="menuitemcheckbox"
        aria-checked={it.checked ?? undefined}
        disabled={it.disabled}
        onClick={onPick}
        className={`menu-item ${tall ? 'min-h-[44px]' : ''}`}
      >
        <span className="w-4 shrink-0 inline-flex justify-center" aria-hidden="true">
          {it.checked ? <span className="text-[var(--accent)]">✓</span> : it.icon}
        </span>
        <span className={`flex-1 ${it.danger ? 'text-[var(--danger)]' : ''}`}>{it.label}</span>
        {it.hint && <kbd>{it.hint}</kbd>}
      </button>
    );
  };

  const drop = (m: (typeof menus)[number]) => (
    <div
      role="menu"
      aria-label={m.label}
      className={`menu-drop absolute top-full mt-1.5 min-w-60 border border-[var(--chrome-line)] bg-[var(--chrome)] z-30 ${
        m.alignRight ? 'right-0' : 'left-0'
      }`}
    >
      {m.items.map((it, i) => {
        if ('sep' in it || 'head' in it) return renderItem(it, i, () => {});
        return renderItem(it, i, it.action);
      })}
    </div>
  );

  return (
    <div
      ref={barRef}
      className="nya-menubar h-11 shrink-0 flex items-center gap-1 px-3 border-b border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] z-20 select-none"
      role="menubar"
      aria-label={t('menu.main')}
    >
      {/* левый «отголосок» ширины правого блока: меню строго по центру окна */}
      <div style={{ width: toolbarW }} className="shrink-0" aria-hidden="true" />
      <div className="flex-1 flex justify-center min-w-0">
        {menus.map((m) => (
          <div key={m.id} className="relative hidden md:block">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              className={`nya-mbtn ${open === m.id ? 'is-open' : ''}`}
              onClick={() => setOpen((v) => (v === m.id ? null : m.id))}
              onMouseEnter={() => {
                if (open !== null && open !== m.id) setOpen(m.id);
              }}
            >
              {m.label}
            </button>
            {open === m.id && drop(m)}
          </div>
        ))}
      </div>

      {/* частые действия — всегда под рукой */}
      <div ref={toolbarRef} className="flex items-center gap-0.5 shrink-0" role="toolbar" aria-label={t('menu.edit')}>
        <button type="button" className="nya-tbtn" onClick={undo} disabled={!canUndo} title={`${t('menu.undo')} · Ctrl+Z`} aria-label={t('menu.undo')}>
          <IUndo />
        </button>
        <button type="button" className="nya-tbtn" onClick={redo} disabled={!canRedo} title={`${t('menu.redo')} · Ctrl+Shift+Z`} aria-label={t('menu.redo')}>
          <IRedo />
        </button>
        <button type="button" className="nya-tbtn" onClick={recalc} title={`${t('menu.recalc')} · Ctrl+↵`} aria-label={t('menu.recalc')}>
          <IRecalc />
        </button>
        <span className="w-px h-5 bg-[var(--chrome-line)] mx-1" aria-hidden="true" />
        <button
          type="button"
          className={`nya-tbtn ${paletteOpen ? 'is-on' : ''}`}
          onClick={togglePalette}
          title={t('menu.palette')}
          aria-label={t('menu.palette')}
          aria-pressed={paletteOpen}
        >
          <IFx />
        </button>
        <button
          type="button"
          className={`nya-tbtn ${formulaPaletteOpen ? 'is-on' : ''}`}
          onClick={toggleFormulaPalette}
          title={t('menu.formulaPalette')}
          aria-label={t('menu.formulaPalette')}
          aria-pressed={formulaPaletteOpen}
        >
          <IFormula />
        </button>
        <button
          type="button"
          className={`nya-tbtn ${constPaletteOpen ? 'is-on' : ''}`}
          onClick={toggleConstPalette}
          title={t('menu.constPalette')}
          aria-label={t('menu.constPalette')}
          aria-pressed={constPaletteOpen}
        >
          <IConst />
        </button>
        <button
          type="button"
          className={`nya-tbtn ${liveConnected ? 'is-on' : ''}`}
          onClick={toggleLive}
          title={liveConnected ? t('live.on') : (liveError ?? t('live.off'))}
          aria-label={t('menu.liveSync')}
          aria-pressed={liveConnected}
        >
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: liveConnected ? 'var(--ok)' : 'var(--faint)' }}
          />
        </button>
        <button type="button" className="nya-tbtn" onClick={toggleTheme} title={theme} aria-label={theme}>
          {THEMES.find((x) => x.id === theme)?.kind === 'light' ? <IMoon /> : <ISun />}
        </button>
      </div>
    </div>
  );
}
