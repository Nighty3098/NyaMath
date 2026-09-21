import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { saveDocument } from '../lib/saveDocument';
import { printDocument } from '../lib/print';
import { downloadLatexReport, downloadMarkdown } from '../lib/report';
import { SHARE_WARN_CHARS, shareDocument } from '../lib/share';
import { THEMES } from '../theme';
import { t, themeLabel, type Lang } from '../i18n';
import { connectLive, disconnectLive, getLiveUrl, setLiveUrl, testLiveConnection } from '../lib/liveSync';
import { listTemplates } from '../lib/db';

/** Пункты подменю шаблонов ГОСТ (пусто, если БД недоступна). */
function templateEntries(): { id: string; label: string }[] {
  try {
    const lang = useCanvasStore.getState().lang;
    return listTemplates().map((tpl) => ({
      id: tpl.id,
      label: lang === 'ru' ? tpl.title.ru : tpl.title.en,
    }));
  } catch {
    return [];
  }
}
import {
  IConst, IField, IFx, IFormula, IGrid, IOpen, IPlot, IPlot3d, IPrint, IProgram,
  IRecalc, IRedo, ISave, ISim, IUndo, IWarn, IX, IZap, ISun, IMoon, ICopy, ISignal, IDemo, IScale,
} from './Icon';

interface MenuBarProps {
  onOpenFile: () => void;
  onShowWelcome: () => void;
  onOpenNavigator: () => void;
  onOpenProblems: () => void;
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
    }
  | {
      id: string;
      icon?: React.ReactNode;
      label: string;
      children: Entry[];
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
export default function MenuBar({ onOpenFile, onShowWelcome, onOpenNavigator, onOpenProblems }: MenuBarProps) {
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
  const loadQuickstart = useCanvasStore((s) => s.loadQuickstart);
  const insertTemplate = useCanvasStore((s) => s.insertTemplate);
  const clear = useCanvasStore((s) => s.clear);
  const recalc = useCanvasStore((s) => s.recalc);
  const calcMode = useCanvasStore((s) => s.calcMode);
  const setCalcMode = useCanvasStore((s) => s.setCalcMode);
  const recalcNow = useCanvasStore((s) => s.recalcNow);
  const staleIds = useCanvasStore((s) => s.staleIds);
  const calcStale = useCanvasStore((s) => s.calcStale);
  const computeActive = useCanvasStore((s) => s.computeActive);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const gridSize = useCanvasStore((s) => s.gridSize);
  const setGridSize = useCanvasStore((s) => s.setGridSize);
  const setGridVisible = useCanvasStore((s) => s.setGridVisible);
  const numFmt = useCanvasStore((s) => s.numFmt);
  const setNumFmt = useCanvasStore((s) => s.setNumFmt);
  const unitSys = useCanvasStore((s) => s.unitSys);
  const setUnitSys = useCanvasStore((s) => s.setUnitSys);
  const separateRegions = useCanvasStore((s) => s.separateRegions);
  const toggleSelectedDisabled = useCanvasStore((s) => s.toggleSelectedDisabled);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const addTextBlock = useCanvasStore((s) => s.addTextBlock);
  const scopeMonOpen = useCanvasStore((s) => s.scopeMonOpen);
  const toggleScopeMon = useCanvasStore((s) => s.toggleScopeMon);
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const togglePalette = useCanvasStore((s) => s.togglePalette);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const toggleFormulaPalette = useCanvasStore((s) => s.toggleFormulaPalette);
  const constPaletteOpen = useCanvasStore((s) => s.constPaletteOpen);
  const toggleConstPalette = useCanvasStore((s) => s.toggleConstPalette);
  const elemPaletteOpen = useCanvasStore((s) => s.elemPaletteOpen);
  const toggleElemPalette = useCanvasStore((s) => s.toggleElemPalette);
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
  // Кружок состояния расчёта: зелёный — чисто, красный — есть ошибки
  const errCount = useMemo(() => Object.values(blocks).filter((b) => b.error).length, [blocks]);

  const [open, setOpen] = useState<string | null>(null);
  const [subOpen, setSubOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        setOpen(null);
        setSubOpen(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setSubOpen(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(null);
    setSubOpen(null);
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
        { id: 'ins-text', icon: <IFormula />, label: t('menu.insText'), action: run(insertAt((x, y) => addTextBlock(x, y))) },
        { id: 'ins-plot', icon: <IPlot />, label: t('menu.insPlot'), action: run(insertAt((x, y) => addPlotBlock(x, y))) },
        { id: 'ins-contour', icon: <IPlot />, label: t('menu.insContour'), action: run(insertAt((x, y) => addContourBlock(x, y))) },
        { id: 'ins-3d', icon: <IPlot3d />, label: t('menu.ins3d'), action: run(insertAt((x, y) => addPlot3dBlock(x, y))) },
        { id: 'ins-prog', icon: <IProgram />, label: t('menu.insProg'), action: run(insertAt((x, y) => addProgramBlock(x, y))) },
        { id: 'ins-slider', icon: <ISignal />, label: t('menu.insSlider'), action: run(insertAt((x, y) => addSliderBlock(x, y))) },
        { id: 'ins-sim', icon: <ISim />, label: t('menu.insSim'), action: run(insertAt((x, y) => addSimBlock(x, y))) },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          id: 'grid-sub', icon: <IGrid />, label: t('menu.grid'), children: [
            { id: 'grid-std', icon: <IGrid />, label: t('menu.gridStandard'), checked: showGrid && gridSize === 'standard', action: run(() => setGridSize('standard')) },
            { id: 'grid-fine', icon: <IGrid />, label: t('menu.gridFine'), checked: showGrid && gridSize === 'fine', action: run(() => setGridSize('fine')) },
            { id: 'grid-off', icon: <IGrid />, label: t('menu.gridOff'), checked: !showGrid, action: run(() => setGridVisible(false)) },
            { sep: true },
            { id: 'separate', icon: <IGrid />, label: t('menu.separate'), action: run(separateRegions) },
          ],
        },
        {
          id: 'fmt-sub', icon: <IFx />, label: t('menu.numFmt'), children: [
            { id: 'fmt-auto', label: t('menu.numAuto'), checked: numFmt.mode === 'auto', action: run(() => setNumFmt({ mode: 'auto', digits: numFmt.digits })) },
            { id: 'fmt-sig', label: t('menu.numSig'), checked: numFmt.mode === 'sig', action: run(() => setNumFmt({ mode: 'sig', digits: numFmt.digits })) },
            { id: 'fmt-fixed', label: t('menu.numFixed'), checked: numFmt.mode === 'fixed', action: run(() => setNumFmt({ mode: 'fixed', digits: numFmt.digits })) },
            { sep: true },
            ...[3, 4, 5, 6, 8, 10].map((d): Entry => ({
              id: `fmt-d${d}`, label: t('menu.numDigits', { n: d }), checked: numFmt.digits === d,
              action: run(() => setNumFmt({ mode: numFmt.mode, digits: d })),
            })),
          ],
        },
        {
          id: 'units-sub', icon: <IScale />, label: t('menu.unitSys'), children: [
            { id: 'units-none', label: t('menu.unitNone'), checked: unitSys === 'none', action: run(() => setUnitSys('none')) },
            { id: 'units-si', label: t('menu.unitSI'), checked: unitSys === 'SI', action: run(() => setUnitSys('SI')) },
            { id: 'units-us', label: t('menu.unitUS'), checked: unitSys === 'US', action: run(() => setUnitSys('US')) },
            { id: 'units-cgs', label: t('menu.unitCGS'), checked: unitSys === 'CGS', action: run(() => setUnitSys('CGS')) },
          ],
        },
        { id: 'scopemon', icon: <ISignal />, label: t('menu.scopeMon'), hint: 'Ctrl+J', checked: scopeMonOpen, action: run(toggleScopeMon) },
        { id: 'dis-sel', icon: <IZap />, label: t('menu.toggleDisabled'), disabled: selectedIds.length === 0, action: run(toggleSelectedDisabled) },
        { id: 'palette', icon: <IFx />, label: t('menu.palette'), checked: paletteOpen, action: run(togglePalette) },
        { id: 'fpalette', icon: <IFormula />, label: t('menu.formulaPalette'), checked: formulaPaletteOpen, action: run(toggleFormulaPalette) },
        { id: 'cpalette', icon: <IConst />, label: t('menu.constPalette'), checked: constPaletteOpen, action: run(toggleConstPalette) },
        { id: 'epalette', icon: <IField />, label: t('menu.elemPalette'), checked: elemPaletteOpen, action: run(toggleElemPalette) },
        { id: 'live', icon: <ISignal />, label: t('menu.liveSync'), checked: liveConnected, action: run(toggleLive) },
        { id: 'recalc', icon: <IRecalc />, label: t('menu.recalc'), hint: 'Ctrl+↵', action: run(recalc) },
        { id: 'variables', icon: <IFx />, label: t('menu.variables'), hint: 'Ctrl+K', action: run(onOpenNavigator) },
        { id: 'problems', icon: <IWarn />, label: t('menu.problems'), hint: 'Ctrl+Shift+M', action: run(onOpenProblems) },
        { sep: true },
        {
          id: 'theme-sub',
          icon: (THEMES.find((x) => x.id === theme)?.kind === 'light' ? <ISun /> : <IMoon />) as React.ReactNode,
          label: t('menu.theme'),
          children: THEMES.map((th) => ({
            id: `theme-${th.id}`,
            icon: (th.kind === 'light' ? <ISun /> : <IMoon />) as React.ReactNode,
            label: themeLabel(th.id),
            checked: theme === th.id,
            action: run(() => setTheme(th.id)),
          })),
        },
        { sep: true },
        langEntry('lang-ru', 'ru', 'Русский'),
        langEntry('lang-en', 'en', 'English'),
      ],
    },
    {
      id: 'examples',
      label: t('menu.examples'),
      items: [
        {
          id: 'tpl-sub', icon: <IFormula />, label: t('menu.templates'), children:
            templateEntries().map((e): Entry => ({
              id: `tpl-${e.id}`, label: e.label,
              action: run(() => insertTemplate(e.id)),
            })),
        },
        { id: 'exquick', icon: <ISignal />, label: t('menu.exQuick'), action: run(loadQuickstart) },
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

  const renderLeaf = (
    it: Extract<Entry, { action: unknown }>,
    _i: number | string,
    onPick: () => void,
    tall = false,
  ) => (
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

  const renderItem = (it: Entry, i: number | string, onPick: () => void, tall = false) => {
    if ('sep' in it) return <div key={`sep${i}`} className="menu-sep" role="separator" />;
    if ('head' in it) return <div key={`h${i}`} className="menu-head">{it.head}</div>;
    if ('children' in it) {
      const expanded = subOpen === it.id;
      return (
        <div
          key={it.id}
          className="relative"
          onMouseEnter={() => {
            if (closeTimer.current) {
              clearTimeout(closeTimer.current);
              closeTimer.current = null;
            }
            setSubOpen(it.id);
          }}
          onMouseLeave={() => {
            // пауза вместо мгновенного закрытия: курсор идёт через зазор к подменю
            if (closeTimer.current) clearTimeout(closeTimer.current);
            closeTimer.current = setTimeout(() => {
              closeTimer.current = null;
              setSubOpen((v) => (v === it.id ? null : v));
            }, 180);
          }}
        >
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={expanded}
            onClick={() => setSubOpen((v) => (v === it.id ? null : it.id))}
            className="menu-item w-full"
          >
            <span className="w-4 shrink-0 inline-flex justify-center" aria-hidden="true">
              {it.icon}
            </span>
            <span className="flex-1">{it.label}</span>
            <span aria-hidden="true" className="text-[var(--faint)]">▸</span>
          </button>
          {expanded && (
            // мост pl-1.5 вместо отступа ml: hover не рвётся между меню и подменю
            <div className="absolute left-full top-0 z-30 pl-1.5">
              <div
                role="menu"
                aria-label={it.label}
                className="menu-drop min-w-60 border border-[var(--chrome-line)] bg-[var(--chrome)]"
              >
                {it.children.map((c, j) => {
                  if ('sep' in c || 'head' in c || 'children' in c) return renderItem(c, `${i}-${j}`, () => {});
                  return renderLeaf(c, `${i}-${j}`, c.action);
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
    return renderLeaf(it, i, onPick, tall);
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
        if ('sep' in it || 'head' in it || 'children' in it) return renderItem(it, i, () => {});
        return renderLeaf(it, i, it.action);
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
      {/* меню слева, частые действия — справа */}
      <div className="flex items-center min-w-0 shrink-0">
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
                setSubOpen(null);
              }}
            >
              {m.label}
            </button>
            {open === m.id && drop(m)}
          </div>
        ))}
      </div>
      <div className="flex-1" aria-hidden="true" />

      {/* частые действия — всегда под рукой */}
      <div className="flex items-center gap-0.5 shrink-0" role="toolbar" aria-label={t('menu.edit')}>
        <button type="button" className="nya-tbtn nya-tbtn-big" onClick={undo} disabled={!canUndo} title={`${t('menu.undo')} · Ctrl+Z`} aria-label={t('menu.undo')}>
          <IUndo />
        </button>
        <button type="button" className="nya-tbtn nya-tbtn-big" onClick={redo} disabled={!canRedo} title={`${t('menu.redo')} · Ctrl+Shift+Z`} aria-label={t('menu.redo')}>
          <IRedo />
        </button>
        <button type="button" className="nya-tbtn relative" onClick={recalc} title={`${t('menu.recalc')} · Ctrl+↵${errCount ? ` · ${t('calc.errors', { n: errCount })}` : ` · ${t('calc.ok')}`}`} aria-label={t('menu.recalc')}>
          <IRecalc />
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: errCount ? 'var(--danger)' : 'var(--ok)' }}
          />
        </button>
        <button
          type="button"
          className={`nya-tbtn relative${calcMode === 'manual' ? ' is-on' : ''}`}
          onClick={() => setCalcMode(calcMode === 'manual' ? 'auto' : 'manual')}
          title={calcMode === 'manual' ? t('menu.calcManual') : t('menu.calcAuto')}
          aria-label={calcMode === 'manual' ? t('menu.calcManual') : t('menu.calcAuto')}
          aria-pressed={calcMode === 'manual'}
        >
          {calcMode === 'manual' ? 'M' : 'A'}
          {(staleIds.length > 0 || calcStale) && (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--warn, #b45309)' }}
            />
          )}
        </button>
        {calcMode === 'manual' && (
          <button
            type="button"
            className="nya-tbtn relative"
            onClick={recalcNow}
            disabled={computeActive}
            title={`${t('menu.calcNowTitle')}${staleIds.length ? ` · ${t('menu.calcStale', { n: staleIds.length })}` : ''}`}
            aria-label={t('menu.calcNow')}
          >
            ⏵
            {staleIds.length > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 inline-block min-w-4 rounded-full px-1 text-center text-[10px] leading-4"
                style={{ background: 'var(--warn, #b45309)', color: '#fff' }}
              >
                {staleIds.length > 99 ? '99+' : staleIds.length}
              </span>
            )}
          </button>
        )}
        <span className="w-px h-5 bg-[var(--chrome-line)] mx-1" aria-hidden="true" />
        <button
          type="button"
          className={`nya-tbtn nya-tbtn-big ${paletteOpen ? 'is-on' : ''}`}
          onClick={togglePalette}
          title={t('menu.palette')}
          aria-label={t('menu.palette')}
          aria-pressed={paletteOpen}
        >
          <IFx />
        </button>
        <button
          type="button"
          className={`nya-tbtn nya-tbtn-big ${formulaPaletteOpen ? 'is-on' : ''}`}
          onClick={toggleFormulaPalette}
          title={t('menu.formulaPalette')}
          aria-label={t('menu.formulaPalette')}
          aria-pressed={formulaPaletteOpen}
        >
          <IFormula />
        </button>
        <button
          type="button"
          className={`nya-tbtn nya-tbtn-big ${constPaletteOpen ? 'is-on' : ''}`}
          onClick={toggleConstPalette}
          title={t('menu.constPalette')}
          aria-label={t('menu.constPalette')}
          aria-pressed={constPaletteOpen}
        >
          <IConst />
        </button>
        <button
          type="button"
          className={`nya-tbtn nya-tbtn-big ${liveConnected ? 'is-on' : ''}`}
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
        <button type="button" className="nya-tbtn nya-tbtn-big" onClick={toggleTheme} title={theme} aria-label={theme}>
          {THEMES.find((x) => x.id === theme)?.kind === 'light' ? <IMoon /> : <ISun />}
        </button>
      </div>
    </div>
  );
}
