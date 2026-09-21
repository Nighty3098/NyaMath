import { useMemo } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { collectScopeVars } from '../lib/scopeVars';
import { statusTone, type StatusTone } from '../lib/status';
import { t } from '../i18n';

const DOT: Record<StatusTone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn, #b45309)',
  err: 'var(--danger)',
  busy: 'var(--accent-line)',
};

/**
 * Нижний статус-бар (DESIGN.md §5 п.7): состояние расчёта + время (как SMath),
 * ошибки + блоки/переменные + сетка (как Prime Status Bar). Только чтение,
 * кликабельного нет — действия остаются в MenuBar.
 */
export default function StatusBar({ onOpenNavigator }: { onOpenNavigator?: () => void }) {
  const blocks = useCanvasStore((s) => s.blocks);
  const calcMs = useCanvasStore((s) => s.calcMs);
  const staleIds = useCanvasStore((s) => s.staleIds);
  const calcStale = useCanvasStore((s) => s.calcStale);
  const computeActive = useCanvasStore((s) => s.computeActive);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const gridSize = useCanvasStore((s) => s.gridSize);
  const numFmt = useCanvasStore((s) => s.numFmt);
  const unitSys = useCanvasStore((s) => s.unitSys);
  const calcMode = useCanvasStore((s) => s.calcMode);
  useCanvasStore((s) => s.lang);

  const errCount = useMemo(() => Object.values(blocks).filter((b) => b.error).length, [blocks]);
  const varCount = useMemo(() => collectScopeVars(blocks).length, [blocks]);
  const blockCount = Object.keys(blocks).length;
  const stale = staleIds.length > 0 || calcStale;
  const tone = statusTone(errCount, staleIds.length, computeActive);

  const stateText =
    errCount > 0
      ? `${t('sb.calcErr')}: ${errCount}`
      : stale
        ? t('menu.calcStale', { n: staleIds.length })
        : t('sb.calcOk');

  return (
    <footer
      className="shrink-0 flex items-center gap-3 px-3 min-h-[28px] text-[11px] bg-[var(--chrome)] border-t border-[var(--chrome-line)] text-[var(--chrome-soft)] print:hidden"
      aria-label={t('sb.calcOk')}
    >
      {errCount > 0 && onOpenNavigator ? (
        <button
          type="button"
          onClick={onOpenNavigator}
          title={t('nv.open')}
          className="inline-flex items-center gap-1.5 min-w-0 cursor-pointer hover:text-[var(--chrome-ink)]"
        >
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: DOT[tone] }}
          />
          <span className="truncate">{stateText}</span>
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: DOT[tone] }}
          />
          <span className="truncate">{stateText}</span>
        </span>
      )}
      <span className="ml-auto math-input tabular-nums whitespace-nowrap">
        {t('sb.blocks')}: {blockCount}
      </span>
      <span className="math-input tabular-nums whitespace-nowrap">
        {t('sb.vars')}: {varCount}
      </span>
      <span className="math-input tabular-nums whitespace-nowrap">
        {t('sb.calcMs')}: {calcMs.toFixed(1)} {t('sb.ms')}
      </span>
      <span className="math-input tabular-nums whitespace-nowrap">
        {t('sb.fmt')}: {numFmt.mode === 'auto' ? t('menu.numAuto') : numFmt.mode === 'sig' ? t('sb.sigN', { n: numFmt.digits }) : t('sb.fixN', { n: numFmt.digits })}
      </span>
      {unitSys !== 'none' && (
        <span className="math-input tabular-nums whitespace-nowrap">
          {t('sb.units')}: {unitSys}
        </span>
      )}
      <span className="math-input tabular-nums whitespace-nowrap">
        {calcMode === 'manual' ? t('sb.calcModeManual') : t('sb.calcModeAuto')}
      </span>
      <span className="whitespace-nowrap">
        {t('sb.grid')}: {!showGrid ? t('sb.gridOff') : gridSize === 'fine' ? t('sb.gridFine') : t('sb.gridStd')}
      </span>
    </footer>
  );
}
