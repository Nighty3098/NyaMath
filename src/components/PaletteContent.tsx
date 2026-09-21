import { useMemo, useState } from 'react';
import { type Snippet } from '../engine/packs';
import {
  listConstEntries, listConstSections, listFormulaSections, listFormulas, listSnippets,
} from '../lib/db';
import { useCanvasStore } from '../store/canvasStore';
import { lx, packName, t, type PackId } from '../i18n';
import {
  IChart, IContour, IFormula, IConst, IFx, IGrid,
  IPlot, IProgram, IScale, ISignal, ISim, IUnits, ICalc, IChip, IField, IZap, IPlay,
} from './Icon';

export type PaletteVariant = 'functions' | 'formulas' | 'constants';

const PACKS: PackId[] = ['matrices', 'stats', 'uncertainty', 'physics', 'em', 'control', 'materials', 'units', 'calc', 'computing', 'telecom', 'programs', 'plots', 'sim'];

const PACK_ICONS: Record<PackId, () => React.JSX.Element> = {
  matrices: IGrid,
  stats: IChart,
  uncertainty: IScale,
  physics: IZap,
  em: IField,
  control: ISignal,
  materials: IFx,
  units: IUnits,
  calc: ICalc,
  computing: IChip,
  telecom: ISignal,
  programs: IProgram,
  plots: IPlot,
  sim: ISim,
};

const KIND_ICONS: Record<Snippet['kind'], () => React.JSX.Element> = {
  math: IFormula,
  plot: IPlot,
  contour: IContour,
  program: IProgram,
  sim: ISim,
};

interface PalItem {
  key: string;
  section: string;
  label: string;
  hint: string;
  code: string;
  doc?: string;
  sources?: { title: string; url: string }[];
  vars?: { name: string; label: { ru: string; en: string } }[];
  plot2d?: string;
  plot3d?: string;
  sim?: string;
  kind: Snippet['kind'];
  snippet?: Snippet;
}

/**
 * Содержимое вкладки палитры: строка поиска + сгруппированный список.
 * Без оконного хрома (перетаскивание/вкладки/закрытие — снаружи),
 * поэтому переиспользуется и в старом FunctionPalette, и в едином окне.
 */
export default function PaletteContent({ variant, autoFocus = false }: { variant: PaletteVariant; autoFocus?: boolean }) {
  const formulas = variant === 'formulas';
  const consts = variant === 'constants';
  const searchId = formulas ? 'formula-search' : consts ? 'const-search' : 'fx-search';
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addBlocks = useCanvasStore((s) => s.addBlocks);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const addContourBlock = useCanvasStore((s) => s.addContourBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const addSimBlock = useCanvasStore((s) => s.addSimBlock);
  const lang = useCanvasStore((s) => s.lang);
  const [q, setQ] = useState('');

  const sections = formulas
    ? listFormulaSections().map((sec) => ({ id: sec.id, label: lx(sec.label) }))
    : consts
    ? listConstSections().map((sec) => ({ id: sec.id, label: lx(sec.label) }))
    : PACKS.map((pack) => ({ id: pack, label: packName(pack) }));

  const items = useMemo<PalItem[]>(() => {
    const sectionLabel = (id: string): string =>
      formulas
        ? lx(listFormulaSections().find((sec) => sec.id === id)?.label ?? { ru: id, en: id })
        : consts
        ? lx(listConstSections().find((sec) => sec.id === id)?.label ?? { ru: id, en: id })
        : packName(id as PackId);
    const all: PalItem[] = formulas
      ? listFormulas().map((f) => ({
          key: f.id,
          section: f.section,
          label: f.label[lang],
          hint: f.hint[lang],
          code: f.code,
          sources: f.sources,
          vars: f.vars,
          plot2d: f.plot2d,
          plot3d: f.plot3d,
          sim: f.sim,
          kind: 'math' as const,
        }))
      : consts
      ? listConstEntries().map((k) => ({
          key: k.id,
          section: k.section,
          label: k.label[lang],
          hint: k.hint[lang],
          code: k.code,
          sources: k.sources,
          kind: 'math' as const,
        }))
      : listSnippets().map((s, i) => ({
          key: `${s.pack}-${i}`,
          section: s.pack,
          label: s.label[lang],
          hint: s.hint[lang],
          code: s.code,
          doc: s.doc,
          kind: s.kind,
          snippet: s,
          plot2d: s.plot2d,
        }));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (it) =>
        it.label.toLowerCase().includes(needle) ||
        it.code.toLowerCase().includes(needle) ||
        it.hint.toLowerCase().includes(needle) ||
        (it.doc ?? '').toLowerCase().includes(needle) ||
        sectionLabel(it.section).toLowerCase().includes(needle) ||
        it.sources?.some((src) => src.title.toLowerCase().includes(needle)) ||
        it.vars?.some(
          (v) =>
            v.name.toLowerCase().includes(needle) ||
            v.label[lang].toLowerCase().includes(needle),
        ),
    );
  }, [q, lang, formulas, consts]);

  const place = () => {
    // вставка — в точку прицела, прицел каскадом уходит вниз
    const st = useCanvasStore.getState();
    const p = { x: st.cross.x, y: st.cross.y };
    st.nudgeCross(0, 140);
    return p;
  };

  const insert = (s: Snippet) => {
    const p = place();
    // plot со своими переменными: сначала блоки переменных выше,
    // затем график ниже — он видит их значения и пересчитывается от них
    const varLines = (s.vars ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if ((s.kind === 'plot' || s.kind === 'contour') && varLines.length > 0) {
      addBlocks(varLines, p.x, p.y);
      const gy = p.y + 64 * varLines.length;
      if (s.kind === 'plot') addPlotBlock(p.x, gy, s.code, s.plot);
      else addContourBlock(p.x, gy, s.code);
      useCanvasStore.getState().nudgeCross(0, 64 * varLines.length);
      return;
    }
    if (s.kind === 'plot') addPlotBlock(p.x, p.y, s.code, s.plot);
    else if (s.kind === 'contour') addContourBlock(p.x, p.y, s.code);
    else if (s.kind === 'program') addProgramBlock(p.x, p.y, s.code, s.exportName ?? '');
    else if (s.kind === 'sim') addSimBlock(p.x, p.y, s.code);
    else addBlock(p.x, p.y, s.code);
  };

  const insertFormula = (code: string) => {
    // каждую строку — отдельным блоком: так любую строку можно править точечно,
    // а порядок сверху-вниз сохраняет зависимости между строками
    const lines = code.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length <= 1) {
      const p = place();
      addBlock(p.x, p.y, code);
      return;
    }
    const p = place();
    addBlocks(lines, p.x, p.y);
    // place() уже увёл прицел на один шаг — дошагнуть под всю лесенку
    useCanvasStore.getState().nudgeCross(0, 140 * (lines.length - 1));
  };

  /** Вставка 2D/3D-графика или симуляции, привязанных к формуле */
  const insertPlot2d = (fn: string) => {
    const p = place();
    addPlotBlock(p.x, p.y, fn);
  };
  const insertPlot3d = (fn: string) => {
    const p = place();
    addPlot3dBlock(p.x, p.y, fn);
  };
  const insertSim = (modelId: string) => {
    const p = place();
    addSimBlock(p.x, p.y, modelId);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <label htmlFor={searchId} className="sr-only">
          {t(formulas ? 'formulaPal.searchLabel' : consts ? 'constPal.searchLabel' : 'pal.searchLabel')}
        </label>
        <input
          id={searchId}
          className="nya-input flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-[13px]"
          placeholder={t(formulas ? 'formulaPal.searchPh' : consts ? 'constPal.searchPh' : 'pal.searchPh')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          autoFocus={autoFocus}
        />
        <span className="math-input tabular-nums text-[11px] text-[var(--chrome-soft)] shrink-0">{items.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {sections.map((sec) => {
          const rows = items.filter((s) => s.section === sec.id);
          if (!rows.length) return null;
          const SecIcon = formulas ? IFormula : consts ? IConst : PACK_ICONS[sec.id as PackId];
          return (
            <div key={sec.id} className="mt-1.5">
              <div className="pal-pack flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--faint)] px-2 py-1.5 rounded-lg">
                <span aria-hidden="true">
                  <SecIcon />
                </span>
                {sec.label}
                <span className="math-input normal-case font-normal tracking-normal opacity-70">{rows.length}</span>
              </div>
              {rows.map((s) => {
                const KindIcon = KIND_ICONS[s.kind];
                const pick = () => (s.snippet ? insert(s.snippet) : insertFormula(s.code));
                return (
                  <div
                    key={s.key}
                    role="button"
                    tabIndex={0}
                    onClick={pick}
                    onKeyDown={(e) => {
                      // вложенные кнопки/ссылки обрабатывают клавиши сами
                      if ((e.target as HTMLElement).closest('button,a')) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick();
                      }
                    }}
                    title={s.hint}
                    aria-label={s.label}
                    className="w-full text-left px-2 py-1.5 rounded-lg border border-transparent hover:border-[var(--chrome-line)] hover:bg-[var(--accent-soft)]/50 group transition-colors duration-120 ease-out cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[var(--accent)] shrink-0" aria-hidden="true">
                        <KindIcon />
                      </span>
                      <span className="text-[13px] leading-4 truncate">{s.label}</span>
                      <span className="ml-auto text-[var(--faint)] group-hover:text-[var(--accent)] group-hover:opacity-100 opacity-0 text-[15px] leading-4 shrink-0 transition-opacity" aria-hidden="true">
                        +
                      </span>
                    </div>
                    <div className="math-input text-[11.5px] leading-4 text-[var(--chrome-soft)] truncate pl-6 mt-0.5">
                      {s.code.split('\n')[0]}
                      {s.code.includes('\n') ? ' …' : ''}
                    </div>
                    {(s.doc ?? s.hint) && (
                      <div className="math-input text-[10.5px] leading-4 text-[var(--faint)] truncate pl-6 mt-0.5">
                        {s.doc ?? s.hint}
                      </div>
                    )}
                    {formulas && s.vars && s.vars.length > 0 && (
                      <div className="pl-6 mt-1">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--faint)]">
                          {t('formulaPal.vars')}
                        </div>
                        {s.vars.map((v) => (
                          <div key={v.name} className="math-input text-[11px] leading-4 text-[var(--chrome-soft)] truncate">
                            <span className="text-[var(--accent)]">{v.name}</span>
                            {' — '}
                            {v.label[lang]}
                          </div>
                        ))}
                      </div>
                    )}
                    {(s.plot2d || s.plot3d || s.sim) && (
                      <div className="flex flex-wrap gap-1.5 pl-6 mt-1.5" onClick={(e) => e.stopPropagation()}>
                        {s.plot2d && (
                          <button
                            type="button"
                            className="text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                            title={t('formulaPal.plot2d')}
                            onClick={() => insertPlot2d(s.plot2d!)}
                          >
                            2D
                          </button>
                        )}
                        {s.plot3d && (
                          <button
                            type="button"
                            className="text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                            title={t('formulaPal.plot3d')}
                            onClick={() => insertPlot3d(s.plot3d!)}
                          >
                            3D
                          </button>
                        )}
                        {s.sim && (
                          <button
                            type="button"
                            className="text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                            title={t('formulaPal.sim')}
                            onClick={() => insertSim(s.sim!)}
                          >
                            <IPlay />
                          </button>
                        )}
                      </div>
                    )}
                    {(formulas || consts) && s.sources && s.sources.length > 0 && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-6 mt-1">
                        {s.sources.map((src) => (
                          <a
                            key={src.url}
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10.5px] leading-4 text-[var(--accent)] underline truncate max-w-full"
                          >
                            {src.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {items.length === 0 && <div className="text-[13px] text-[var(--chrome-soft)] p-3">{t(formulas ? 'formulaPal.empty' : consts ? 'constPal.empty' : 'pal.empty')}</div>}
      </div>
    </div>
  );
}
