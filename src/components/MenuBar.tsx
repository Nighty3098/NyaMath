import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { saveDocument } from '../lib/saveDocument';
import { printDocument } from '../lib/print';
import { downloadLatexReport, downloadMarkdown } from '../lib/report';
import { SHARE_WARN_CHARS, shareDocument } from '../lib/share';
import { THEMES } from '../theme';
import { t, themeLabel, type Lang } from '../i18n';
import {
  IDemo, IFx, IFormula, IGrid, IOpen, IPlot, IPlot3d, IPrint, IProgram,
  IRecalc, IRedo, ISave, ISim, IUndo, IX, IZap, ISun, IMoon, ICopy, ISignal,
} from './Icon';

interface MenuBarProps {
  onOpenFile: () => void;
  onShowWelcome: () => void;
}

type Entry =
  | { sep: true }
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
 * Десктопная строка меню: Файл · Вставка · Правка · Вид · Примеры · Справка.
 * Клик — открыть, наведение при открытом — переключить, Esc/клик мимо — закрыть.
 */
export default function MenuBar({ onOpenFile, onShowWelcome }: MenuBarProps) {
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
  const theme = useCanvasStore((s) => s.theme);
  const setTheme = useCanvasStore((s) => s.setTheme);
  const lang = useCanvasStore((s) => s.lang);
  const setLang = useCanvasStore((s) => s.setLang);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.past.length > 0);
  const canRedo = useCanvasStore((s) => s.future.length > 0);

  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const run = (fn: () => void) => () => {
    setOpen(null);
    fn();
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

  const menus: { id: string; label: string; alignRight?: boolean; items: Entry[] }[] = [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { id: 'new-math', icon: <IFormula />, label: t('menu.newMath'), action: run(() => { const p = atCross(); addBlock(p.x, p.y); }) },
        { sep: true },
        { id: 'save', icon: <ISave />, label: t('menu.save'), hint: 'Ctrl+S', action: run(() => void saveDocument(blocks)) },
        { id: 'open', icon: <IOpen />, label: t('menu.open'), action: run(onOpenFile) },
        { id: 'share', icon: <ICopy />, label: t('menu.share'), action: run(() => void shareCurrentSheet()) },
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
        { id: 'ins-math', icon: <IFormula />, label: t('menu.insMath'), action: run(() => { const p = atCross(); addBlock(p.x, p.y); }) },
        { id: 'ins-plot', icon: <IPlot />, label: t('menu.insPlot'), action: run(() => { const p = atCross(); addPlotBlock(p.x, p.y); }) },
        { id: 'ins-contour', icon: <IPlot />, label: t('menu.insContour'), action: run(() => { const p = atCross(); addContourBlock(p.x, p.y); }) },
        { id: 'ins-3d', icon: <IPlot3d />, label: t('menu.ins3d'), action: run(() => { const p = atCross(); addPlot3dBlock(p.x, p.y); }) },
        { id: 'ins-prog', icon: <IProgram />, label: t('menu.insProg'), action: run(() => { const p = atCross(); addProgramBlock(p.x, p.y); }) },
        { id: 'ins-slider', icon: <ISignal />, label: t('menu.insSlider'), action: run(() => { const p = atCross(); addSliderBlock(p.x, p.y); }) },
        { id: 'ins-sim', icon: <ISim />, label: t('menu.insSim'), action: run(() => { const p = atCross(); addSimBlock(p.x, p.y); }) },
        { sep: true },
        { id: 'ins-pal', icon: <IFx />, label: t('menu.insPal'), action: run(togglePalette) },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        { id: 'undo', icon: <IUndo />, label: t('menu.undo'), hint: 'Ctrl+Z', disabled: !canUndo, action: run(undo) },
        { id: 'redo', icon: <IRedo />, label: t('menu.redo'), hint: 'Ctrl+Shift+Z', disabled: !canRedo, action: run(redo) },
        { sep: true },
        { id: 'recalc', icon: <IRecalc />, label: t('menu.recalc'), hint: 'Ctrl+Enter', action: run(recalc) },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        { id: 'grid', icon: <IGrid />, label: t('menu.grid'), checked: showGrid, action: run(toggleGrid) },
        { id: 'palette', icon: <IFx />, label: t('menu.palette'), checked: paletteOpen, action: run(togglePalette) },
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

  return (
    <div
      ref={barRef}
      className="nya-menubar h-10 shrink-0 flex items-center gap-0.5 px-2 border-b border-[var(--chrome-line)] bg-[var(--chrome)]/90 backdrop-blur-xl text-[var(--chrome-ink)] z-20 select-none"
      role="menubar"
      aria-label={t('menu.main')}
    >
      <div className="font-semibold tracking-tight text-[14px] whitespace-nowrap mr-2 pl-1">
        <span className="text-[var(--accent)]">Nya</span>Math
      </div>
      {menus.map((m) => (
        <div key={m.id} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            className={`min-h-[32px] px-2.5 rounded-md text-[13px] cursor-pointer transition-colors duration-150 ease-out active:scale-[0.96] ${
              open === m.id ? 'bg-white/10 text-[var(--chrome-ink)]' : 'text-[var(--chrome-soft)] hover:text-[var(--chrome-ink)] hover:bg-white/5'
            }`}
            onClick={() => setOpen((v) => (v === m.id ? null : m.id))}
            onMouseEnter={() => {
              if (open !== null && open !== m.id) setOpen(m.id);
            }}
          >
            {m.label}
          </button>
          {open === m.id && (
            <div
              role="menu"
              aria-label={m.label}
              className={`menu-drop absolute top-full mt-1 min-w-60 py-1 rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome)] shadow-2xl z-30 ${
                m.alignRight ? 'right-0' : 'left-0'
              }`}
            >
              {m.items.map((it, i) =>
                'sep' in it ? (
                  <div key={`sep${i}`} className="my-1 border-t border-[var(--chrome-line)]" role="separator" />
                ) : (
                  <button
                    key={it.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={it.checked ?? undefined}
                    disabled={it.disabled}
                    onClick={it.action}
                    className="w-full flex items-center gap-2.5 px-3 min-h-[36px] text-[13px] text-left cursor-pointer transition-colors duration-150 ease-out hover:bg-white/5 hover:text-[var(--chrome-ink)] text-[var(--chrome-soft)] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span className="w-4 shrink-0 inline-flex justify-center" aria-hidden="true">
                      {it.checked ? <span className="text-[var(--accent)]">✓</span> : it.icon}
                    </span>
                    <span className={`flex-1 ${it.danger ? 'text-[var(--danger)]' : ''}`}>{it.label}</span>
                    {it.hint && (
                      <kbd className="math-input text-[11px] text-[var(--chrome-soft)] opacity-80">{it.hint}</kbd>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
