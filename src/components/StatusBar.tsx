import { useMemo } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';

/**
 * Нижняя линейка чертежа: состояние расчёта, число блоков,
 * координаты прицела и шаг сетки. Моноширинные подписи, как штамп.
 */
export default function StatusBar() {
  const blocks = useCanvasStore((s) => s.blocks);
  const cross = useCanvasStore((s) => s.cross);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const gridSize = useCanvasStore((s) => s.gridSize);
  const calcMs = useCanvasStore((s) => s.calcMs);

  const errCount = useMemo(
    () => Object.values(blocks).filter((b) => b.error).length,
    [blocks],
  );
  const blockCount = Object.keys(blocks).length;
  const varCount = useMemo(
    () => Object.values(blocks).filter((b) => b.definedVar).length,
    [blocks],
  );

  return (
    <div
      className="h-7 shrink-0 flex items-center gap-4 px-3 border-t border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-soft)] select-none print:hidden"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]">
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: errCount ? 'var(--danger)' : 'var(--ok)' }}
        />
        {errCount ? `${t('sb.calcErr')}: ${errCount}` : t('sb.calcOk')}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
        {t('sb.blocks')}: {blockCount}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
        {t('sb.vars')}: {varCount}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] tabular-nums">
        {t('sb.calcMs')}: {(calcMs < 10 ? calcMs.toFixed(1) : Math.round(calcMs).toString()).replace('.', ',')} {t('sb.ms')}
      </span>
      <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] tabular-nums">
        {t('sb.cross')}: {Math.round(cross.x)}, {Math.round(cross.y)}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
        {t('sb.grid')}: {!showGrid ? t('sb.gridOff') : gridSize === 'fine' ? t('sb.gridFine') : t('sb.gridStd')}
      </span>
    </div>
  );
}
