import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { blockDefs, blockDeps, type MathBlockData } from '../engine/dependencies';
import { focusBlock } from '../lib/focusBlock';
import { t, type StrKey } from '../i18n';
import { IChip, IFormula, IGrid, IPlot, IPlot3d, IProgram, ISignal, ISim, IX } from './Icon';

interface NavBlock {
  id: string;
  kind: MathBlockData['kind'];
  snippet: string;
  value: string | null;
}

interface NavEntry {
  name: string;
  defs: NavBlock[];
  uses: NavBlock[];
}

const KIND_LABEL: Record<MathBlockData['kind'], StrKey> = {
  math: 'nv.kind.math',
  plot: 'nv.kind.plot',
  plot3d: 'nv.kind.plot3d',
  contour: 'nv.kind.contour',
  program: 'nv.kind.program',
  sim: 'nv.kind.sim',
  slider: 'nv.kind.slider',
  text: 'nv.kind.text',
};

const KIND_ICON: Record<MathBlockData['kind'], () => React.JSX.Element> = {
  math: IFormula,
  plot: IPlot,
  plot3d: IPlot3d,
  contour: IGrid,
  program: IProgram,
  sim: ISim,
  slider: ISignal,
  text: IChip,
};

const SHORT = (s: string, n = 46) => {
  const line = s.split('\n')[0]?.trim() ?? '';
  return line.length > n ? line.slice(0, n - 1) + '…' : line || '…';
};

const snippetOf = (b: MathBlockData): string => {
  switch (b.kind) {
    case 'plot':
    case 'plot3d':
    case 'contour':
      return b.plotFn ?? '';
    case 'program':
      return b.exportName ? `${b.exportName} := program` : SHORT(b.rawInput);
    case 'sim':
      return (b.simMode ?? 'ode') === 'fdtd' ? 'FDTD' : (b.simStates ?? 'x') + ': ODE';
    case 'slider':
      return `${b.sliderVar ?? '?'} = ${b.sliderVal ?? ''}`;
    case 'text':
      return SHORT(b.rawInput);
    default:
      return SHORT(b.rawInput);
  }
};

const valueOf = (b: MathBlockData, name: string): string | null => {
  if (b.error || b.definedVar !== name || b.resultValue == null) return null;
  const v = b.resultValue;
  if (typeof v === 'number' && isFinite(v)) return b.resultStr;
  if (typeof v === 'string' && v.length < 24) return v;
  if (typeof v === 'boolean') return String(v);
  return null;
};

interface Props {
  onClose: () => void;
}

/** Ctrl+K: навигатор переменных листа — где определено, где используется. */
export default function VariableNavigator({ onClose }: Props) {
  const blocks = useCanvasStore((s) => s.blocks);
  useCanvasStore((s) => s.lang);

  const entries = useMemo<NavEntry[]>(() => {
    const map = new Map<string, NavEntry>();
    const push = (name: string, kind: keyof NavEntry, b: MathBlockData) => {
      let e = map.get(name);
      if (!e) {
        e = { name, defs: [], uses: [] };
        map.set(name, e);
      }
      (e[kind] as NavBlock[]).push({ id: b.id, kind: b.kind, snippet: snippetOf(b), value: kind === 'defs' ? valueOf(b, name) : null });
    };
    for (const b of Object.values(blocks)) {
      for (const n of blockDefs(b)) push(n, 'defs', b);
      for (const n of blockDeps(b)) push(n, 'uses', b);
    }
    return [...map.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }, [blocks]);

  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (!nq) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(nq) || e.defs.some((d) => d.snippet.toLowerCase().includes(nq)));
  }, [entries, q]);
  const safeSel = filtered.length ? Math.min(sel, filtered.length - 1) : -1;

  const scrollToSel = useCallback((i: number) => {
    const el = listRef.current;
    if (!el) return;
    const row = el.children[i] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((v) => (v + 1) % Math.max(1, filtered.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((v) => (v - 1 + filtered.length) % Math.max(1, filtered.length));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const hit = safeSel >= 0 ? filtered[safeSel] : undefined;
        if (hit?.defs[0]) focusBlock(hit.defs[0].id);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [filtered, safeSel, onClose]);

  useEffect(() => {
    scrollToSel(safeSel);
  }, [safeSel, scrollToSel]);

  const cur = safeSel >= 0 ? filtered[safeSel] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-label={t('nv.title')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-[680px] max-w-[92vw] h-[460px] max-h-[85vh] flex flex-col rounded-xl bg-[var(--sheet)] border border-[var(--line)] shadow-2xl overflow-hidden">
        {/* шапка: поиск + количество */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--line)]">
          <span className="text-[var(--faint)] inline-flex" aria-hidden="true">
            <IX />
          </span>
          <input
            autoFocus
            className="math-input flex-1 min-h-[34px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)]"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder={t('nv.search')}
            spellCheck={false}
            aria-label={t('nv.search')}
          />
          <span className="text-[11px] text-[var(--faint)] whitespace-nowrap">{filtered.length}</span>
        </div>
        {entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--faint)] px-6 text-center">
            {t('nv.none')}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-row">
            {/* список переменных */}
            <div ref={listRef} className="w-[240px] border-r border-[var(--line)] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-[var(--faint)]">{t('nv.empty')}</div>
              ) : (
                filtered.map((e, i) => {
                  const Icon = KIND_ICON[e.defs[0]?.kind ?? 'math'];
                  const active = i === safeSel;
                  return (
                    <button
                      key={e.name}
                      type="button"
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                        active ? 'bg-[var(--accent-line)]/15' : 'hover:bg-[var(--accent-line)]/10'
                      }`}
                      onClick={() => setSel(i)}
                      onMouseEnter={() => setSel(i)}
                    >
                      <span className="text-[var(--faint)] inline-flex shrink-0">
                        <Icon />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] text-[var(--ink)] font-medium truncate">{e.name}</span>
                        <span className="block text-[10px] text-[var(--faint)] truncate">{e.uses.length > 0 ? t('nv.usedIn', { n: e.uses.length }) : '—'}</span>
                      </span>
                      {e.defs[0]?.value != null && (
                        <span className="text-[11px] text-[var(--faint)] font-mono truncate max-w-[72px]" title={e.defs[0].value}>
                          {e.defs[0].value}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {/* детали: определения и использования */}
            <div className="flex-1 min-w-0 overflow-y-auto p-3">
              {!cur ? (
                <div className="text-[13px] text-[var(--faint)]">{t('nv.empty')}</div>
              ) : (
                <>
                  <div className="text-[15px] font-semibold text-[var(--ink)] mb-2 break-all">{cur.name}</div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--faint)] mb-1">{t('nv.defs')}</div>
                  {cur.defs.length === 0 ? (
                    <div className="text-[12px] text-[var(--faint)] mb-3">—</div>
                  ) : (
                    <ul className="space-y-1 mb-3">
                      {cur.defs.map((d, i) => (
                        <BlockRow key={d.id} b={d} label={t(KIND_LABEL[d.kind])} onGo={() => focusBlock(d.id)} emphasize={i === cur.defs.length - 1} />
                      ))}
                    </ul>
                  )}
                  <div className="text-[11px] uppercase tracking-wider text-[var(--faint)] mb-1">{t('nv.uses')}</div>
                  {cur.uses.length === 0 ? (
                    <div className="text-[12px] text-[var(--faint)]">—</div>
                  ) : (
                    <ul className="space-y-1">
                      {cur.uses.map((u) => (
                        <BlockRow key={u.id} b={u} label={t(KIND_LABEL[u.kind])} onGo={() => focusBlock(u.id)} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockRow({ b, label, onGo, emphasize }: { b: NavBlock; label: string; onGo: () => void; emphasize?: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border cursor-pointer group ${
        emphasize ? 'border-[var(--accent-line)]/50 bg-[var(--accent-line)]/10' : 'border-[var(--line)]/60 hover:border-[var(--accent-line)]/50'
      }`}
      onClick={onGo}
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--accent-ink)] shrink-0">{label}</span>
      <span className="text-[12px] text-[var(--ink)] truncate flex-1 font-mono">{b.snippet}</span>
      {b.value != null && <span className="text-[11px] text-[var(--faint)] font-mono truncate max-w-[90px]"> = {b.value}</span>}
      <span className="text-[11px] text-[var(--accent-line)] opacity-0 group-hover:opacity-100 shrink-0">{t('nv.goto')}</span>
    </li>
  );
}