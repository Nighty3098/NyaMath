import { useMemo, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { collectScopeVars } from '../lib/scopeVars';
import { focusBlock } from '../lib/focusBlock';
import { t } from '../i18n';

/**
 * Вкладка «Переменные»: живая телеметрия листа (как пульт ScopeMonitor),
 * но внутри единого окна палитр. Клик — прыжок к блоку,
 * кнопка внизу — полный навигатор (где определено/где используется).
 */
export default function VariablesContent({ onOpenNavigator }: { onOpenNavigator?: () => void }) {
  const blocks = useCanvasStore((s) => s.blocks);
  const calcMs = useCanvasStore((s) => s.calcMs);
  const [q, setQ] = useState('');
  const vars = useMemo(() => collectScopeVars(blocks), [blocks]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vars;
    return vars.filter(
      (v) => v.name.toLowerCase().includes(needle) || v.value.toLowerCase().includes(needle),
    );
  }, [vars, q]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <label htmlFor="vars-search" className="sr-only">
          {t('nv.search')}
        </label>
        <input
          id="vars-search"
          className="nya-input flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-[13px]"
          placeholder={t('nv.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <span className="math-input tabular-nums text-[11px] text-[var(--chrome-soft)] shrink-0">{filtered.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-[var(--faint)]">
            {vars.length === 0 ? t('scopeMon.empty') : t('nv.empty')}
          </div>
        )}
        {filtered.map((v) => (
          <button
            key={v.name}
            type="button"
            onClick={() => focusBlock(v.blockId)}
            title={v.name}
            className="w-full flex items-baseline gap-2 px-3 py-[7px] text-left hover:bg-white/5 cursor-pointer"
          >
            <span className="font-mono text-[13px] font-bold text-[var(--accent-line)] shrink-0">
              {v.name}
            </span>
            <span
              className={`math-input ml-auto text-[12px] truncate tabular-nums ${
                v.hasError ? 'text-[var(--danger)]' : 'text-[var(--chrome-ink)]'
              }`}
            >
              {v.value}
            </span>
          </button>
        ))}
      </div>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-[var(--chrome-line)]">
        <span className="math-input text-[10.5px] text-[var(--faint)] tabular-nums">
          {t('sb.calcMs')}: {calcMs.toFixed(1)} {t('sb.ms')}
        </span>
        {onOpenNavigator && (
          <button
            type="button"
            className="ml-auto text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
            title={t('nv.open')}
            onClick={onOpenNavigator}
          >
            {t('menu.variables')} · Ctrl+K
          </button>
        )}
      </div>
    </div>
  );
}
