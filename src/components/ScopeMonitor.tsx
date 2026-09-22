import { useMemo } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { collectScopeVars } from '../lib/scopeVars';
import { focusBlock } from '../lib/focusBlock';
import { t } from '../i18n';

/**
 * Пульт инженера: живая телеметрия переменных листа.
 * Правая док-панель, обновляется каждым пересчётом; клик — прыжок к блоку.
 */
export default function ScopeMonitor() {
  const blocks = useCanvasStore((s) => s.blocks);
  const toggleScopeMon = useCanvasStore((s) => s.toggleScopeMon);
  const vars = useMemo(() => collectScopeVars(blocks), [blocks]);

  return (
    <div
      className="w-64 shrink-0 flex flex-col min-h-0 border-l border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] print:hidden"
      role="complementary"
      aria-label={t('scopeMon.aria')}
    >
      <div className="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-[var(--chrome-line)]">
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full animate-pulse"
          style={{ background: 'var(--ok)' }}
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--chrome-soft)]">
          {t('scopeMon.title')}
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--faint)] tabular-nums">
          {vars.length}
        </span>
        <button
          type="button"
          className="nya-tbtn w-8 h-8 text-[13px]"
          title={t('scopeMon.close')}
          aria-label={t('scopeMon.close')}
          onClick={toggleScopeMon}
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {vars.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-[var(--faint)]">{t('scopeMon.empty')}</div>
        )}
        {vars.map((v) => (
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
    </div>
  );
}
