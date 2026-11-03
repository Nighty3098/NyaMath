import { memo, useRef } from 'react';
import type { MathBlockData } from '../engine/dependencies';
import { useCanvasStore } from '../store/canvasStore';
import { formatNumberWith } from '../engine/format';
import { useRegionDrag } from './useRegionDrag';
import { IGrip, IWarn, IX } from './Icon';
import StaleChip from './StaleChip';
import { t } from '../i18n';

interface Props {
  block: MathBlockData;
  scale: number;
}

const numOr = (v: unknown, fb: number): number => (typeof v === 'number' && isFinite(v) ? v : fb);

/**
 * Слайдер параметра: значение ползунка уходит в scope как переменная,
 * всё ниже по листу пересчитывается живьём.
 * Ползунок кастомный (div + Pointer Events): нативный input[type=range]
 * не тянется пальцем под touch-action:none холста.
 */
function SliderBlockView({ block, scale }: Props) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const select = useCanvasStore((s) => s.select);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const numFmt = useCanvasStore((s) => s.numFmt);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, false);
  const trackRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef(false);

  const selected = selectedIds.includes(block.id);
  const lo = numOr(block.sliderMin, 0);
  const hi = numOr(block.sliderMax, 10);
  const step = numOr(block.sliderStep, (hi - lo) / 100 || 1);
  const okRange = hi > lo && isFinite(step) && step > 0;
  const val =
    typeof block.sliderVal === 'number' && isFinite(block.sliderVal)
      ? block.sliderVal
      : typeof block.resultValue === 'number' && isFinite(block.resultValue)
        ? block.resultValue
        : lo;
  const frac = okRange ? Math.min(1, Math.max(0, (val - lo) / (hi - lo))) : 0;
  const valueLabel = okRange ? formatNumberWith(val, numFmt) : block.resultStr || '—';

  const snap = (raw: number): number => {
    const n = Math.round((raw - lo) / step);
    return Number((lo + n * step).toPrecision(12));
  };

  const valFromClientX = (clientX: number): number => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return val;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return snap(lo + f * (hi - lo));
  };

  const beginGesture = () => {
    if (gestureRef.current) return;
    gestureRef.current = true;
    useCanvasStore.getState().beginGesture();
  };

  const endGesture = () => {
    if (!gestureRef.current) return;
    gestureRef.current = false;
    useCanvasStore.getState().commitDrag();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!okRange) return;
    const st = useCanvasStore.getState();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      beginGesture();
      st.setSliderValue(block.id, snap(val - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      beginGesture();
      st.setSliderValue(block.id, snap(val + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      beginGesture();
      st.setSliderValue(block.id, lo);
    } else if (e.key === 'End') {
      e.preventDefault();
      beginGesture();
      st.setSliderValue(block.id, hi);
    }
  };

  const numField = (label: string, value: number, apply: (v: number) => void) => (
    <label className="inline-flex items-center gap-1 text-[12px] text-[var(--ink-soft)]">
      {label}
      <input
        type="number"
        className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
        value={value}
        step="any"
        onChange={(e) => {
          const v = Number(e.target.value);
          if (isFinite(v)) apply(v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  );

  return (
    <div
      className="nya-region absolute z-10"
      style={{ left: block.x, top: block.y }}
      data-visibility={block.visibility ?? 'show'}
    >
      <div
        data-block-id={block.id}
        className={`nya-block relative rounded-xl px-2 py-1.5 group min-w-[240px] ${
          block.error
            ? 'outline outline-2 outline-[var(--danger)] bg-[var(--danger-bg)]'
            : selected
              ? 'outline outline-2 outline-[var(--accent-line)]'
              : 'hover:outline hover:outline-1 hover:outline-[var(--hover-line)]'
        }`}
        style={block.w ? { width: block.w } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
        title={block.sliderVar ? `${block.sliderVar} = ${block.resultStr}` : t('slider.title')}
      >
        {/* ручка перетаскивания */}
        <span
          className="absolute -left-6 top-1/2 -translate-y-1/2 p-1.5 text-[var(--faint)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 select-none"
          style={{ opacity: selected ? 1 : undefined }}
          title={t('ui.dragGrip')}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <IGrip />
        </span>
        {/* удаление */}
        <button
          type="button"
          className="absolute -right-7 top-0 p-1.5 text-[var(--faint)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 cursor-pointer"
          style={{ opacity: selected ? 1 : undefined }}
          title={t('ui.delete')}
          aria-label={t('m.deleteBlock')}
          onClick={(e) => {
            e.stopPropagation();
            removeBlock(block.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IX />
        </button>

        {/* шапка: переменная = значение */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            aria-label={t('slider.var')}
            title={t('slider.var')}
            className="math-input w-[76px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[14px] text-[var(--ink)] outline-none select-text"
            value={block.sliderVar ?? ''}
            spellCheck={false}
            onChange={(e) =>
              useCanvasStore.getState().updateSlider(block.id, { sliderVar: e.target.value })
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-[14px] text-[var(--faint)]">=</span>
          <span className="math-input text-[14px] text-[var(--ink)] truncate">{valueLabel}</span>
        </div>

        {/* ползунок */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={okRange ? 0 : -1}
          aria-label={t('slider.aria')}
          aria-valuemin={lo}
          aria-valuemax={hi}
          aria-valuenow={Number(val.toPrecision(6))}
          aria-disabled={!okRange}
          className={`relative mt-2 h-[28px] rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] cursor-pointer ${
            okRange ? '' : 'opacity-50 pointer-events-none'
          }`}
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            beginGesture();
            useCanvasStore.getState().setSliderValue(block.id, valFromClientX(e.clientX));
          }}
          onPointerMove={(e) => {
            if (!gestureRef.current) return;
            e.stopPropagation();
            useCanvasStore.getState().setSliderValue(block.id, valFromClientX(e.clientX));
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            endGesture();
          }}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onKeyDown={onKey}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div
            className="absolute left-0 top-0 bottom-0 rounded-lg bg-[var(--accent-soft)] border-r-2 border-[var(--accent-line)] pointer-events-none"
            style={{ width: `${frac * 100}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[18px] h-[18px] rounded-full bg-[var(--accent-line)] pointer-events-none"
            style={{ left: `${frac * 100}%` }}
          />
        </div>

        {/* диапазон и шаг */}
        <div
          className="flex items-center gap-2 mt-1.5 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {numField(t('slider.min'), lo, (v) =>
            useCanvasStore.getState().updateSlider(block.id, { sliderMin: v }),
          )}
          {numField(t('slider.max'), hi, (v) =>
            useCanvasStore.getState().updateSlider(block.id, { sliderMax: v }),
          )}
          {numField(t('slider.step'), step, (v) => {
            if (v > 0) useCanvasStore.getState().updateSlider(block.id, { sliderStep: v });
          })}
        </div>

        {block.error && (
          <div
            className="flex items-center gap-1.5 text-[12px] leading-5 text-[var(--danger)] mt-1"
            role="alert"
          >
            <IWarn /> {block.error}
          </div>
        )}
        <StaleChip id={block.id} />
      </div>
    </div>
  );
}

export default memo(SliderBlockView);
