import { memo, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import type { MathBlockData } from '../engine/dependencies';
import { recalculateAll } from '../engine/dependencies';
import { createBaseScope } from '../engine/mathEngine';
import { debugProgram } from '../engine/program';
import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IBug, IGrip, IResize, IWarn, IX } from './Icon';

interface Props {
  block: MathBlockData;
  scale: number;
}

/**
 * Программный регион в стиле Mathcad: вертикальная черта слева,
 * прозрачный фон, высота по содержимому, ширина — авто/вручную.
 * Пустой блок при выходе из редактирования удаляется.
 */
function ProgramBlockView({ block, scale }: Props) {
  const updateInput = useCanvasStore((s) => s.updateInput);
  const setExportName = useCanvasStore((s) => s.setExportName);
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const select = useCanvasStore((s) => s.select);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const blocks = useCanvasStore((s) => s.blocks);
  const [editing, setEditing] = useState(block.rawInput === '');
  const [draft, setDraft] = useState(block.rawInput);
  const [showDebug, setShowDebug] = useState(false);
  const [selStep, setSelStep] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, editing);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, regionRef);

  useEffect(() => {
    if (!editing) setDraft(block.rawInput);
  }, [block.rawInput, editing]);

  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
      const len = taRef.current?.value.length ?? 0;
      taRef.current?.setSelectionRange(len, len);
    }
  }, [editing]);

  const resultHtml = useMemo(() => {
    if (!block.resultLatex || block.error) return '';
    try {
      return katex.renderToString(block.resultLatex, { throwOnError: false, displayMode: false, strict: false });
    } catch {
      return '';
    }
  }, [block.resultLatex, block.error]);

  const selected = selectedIds.includes(block.id);
  const rows = Math.min(16, Math.max(5, draft.split('\n').length + 1));

  /** Данные отладчика: пошаговый прогон в контексте переменных документа. */
  const debug = useMemo(() => {
    if (!showDebug) return null;
    try {
      const mathBlocks = Object.values(blocks).filter((b) => b.kind === 'math');
      const { scope } = recalculateAll(mathBlocks);
      const base = { ...createBaseScope(), ...scope };
      return debugProgram(block.rawInput, base);
    } catch (e) {
      return { steps: [], truncated: false, error: e instanceof Error ? e.message : String(e), errorLine: null };
    }
  }, [showDebug, block.rawInput, blocks]);
  const selDebugStep = selStep == null ? debug?.steps[debug.steps.length - 1] ?? null : (debug?.steps.find((s) => s.n === selStep) ?? null);

  const finishEdit = (value: string) => {
    if (value.trim() === '') removeBlock(block.id);
    else updateInput(block.id, value);
    setEditing(false);
  };

  return (
    <div className="nya-region absolute z-10" style={{ left: block.x, top: block.y }}>
      <div
        ref={regionRef}
        data-block-id={block.id}
        className={`nya-block relative rounded-xl pl-2.5 pr-1.5 py-1 border-l-[3px] transition-shadow group ${
          block.error
            ? 'border-[var(--danger)] bg-[var(--danger-bg)] shadow-[0_0_0_1.5px_var(--danger)]'
            : selected
              ? 'border-[var(--ink)] shadow-[0_0_0_1.5px_var(--accent-line)]'
              : 'border-[var(--ink)]/60 hover:shadow-[0_0_0_1px_var(--hover-line)]'
        }`}
        style={block.w ? { width: block.w } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
        title={t('g.title')}
      >
        {/* ручка */}
        <span
          className="absolute -left-7 top-2 p-1.5 text-[var(--faint)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 select-none"
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
        {/* ручка ширины */}
        <span
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--accent-line)] select-none"
          style={{ opacity: selected ? 1 : undefined }}
          title={t('ui.resizeW')}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <IResize />
        </span>

        {/* мини-панель: экспорт + удаление */}
        <div
          className="flex items-center gap-2 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ opacity: selected || editing ? 1 : undefined }}
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--faint)]">program →</span>
          <label htmlFor={`export-${block.id}`} className="sr-only">
            {t('g.exportLabel')}
          </label>
          <input
            id={`export-${block.id}`}
            className="math-input w-20 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)] select-text"
            value={block.exportName ?? ''}
            placeholder={t('g.exportPh')}
            title={t('g.exportTitle')}
            onChange={(e) => setExportName(block.id, e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
          />
          <button
            type="button"
            className="inline-flex items-center gap-1 px-1.5 min-h-[28px] text-[11px] rounded-md border border-[var(--input-border)] text-[var(--faint)] hover:text-[var(--accent-line)] hover:border-[var(--accent-line)] cursor-pointer"
            title={t('g.debugTitle')}
            onClick={(e) => {
              e.stopPropagation();
              setSelStep(null);
              setShowDebug((v) => !v);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <IBug /> {t(showDebug ? 'g.debugHide' : 'g.debugShow')}
          </button>
          <button
            type="button"
            className="ml-auto p-1 text-[var(--faint)] hover:text-[var(--danger)] cursor-pointer"
            title={t('ui.delete')}
            aria-label={t('g.deleteBlock')}
            onClick={(e) => {
              e.stopPropagation();
              removeBlock(block.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <IX />
          </button>
        </div>

        {editing ? (
          <textarea
            ref={taRef}
            rows={rows}
            className="math-input w-[440px] max-w-[60vw] bg-[var(--input-bg)] border border-[var(--accent-line)] rounded-lg px-1.5 py-1 text-[13px] leading-5 text-[var(--ink)] outline-none resize-none select-text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              updateInput(block.id, e.target.value);
            }}
            onBlur={() => finishEdit(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (draft.trim() === '') removeBlock(block.id);
                else {
                  setDraft(block.rawInput);
                  setEditing(false);
                }
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                const el = e.currentTarget;
                const s = el.selectionStart;
                const v = draft.slice(0, s) + '  ' + draft.slice(el.selectionEnd);
                setDraft(v);
                updateInput(block.id, v);
                requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
              }
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        ) : (
          <pre
            className="math-input text-[13px] leading-[22px] text-[var(--ink)] whitespace-pre-wrap break-words cursor-text"
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey) toggleSelect(block.id);
              else {
                select(block.id);
                setDraft(block.rawInput);
                setEditing(true);
              }
            }}
            title={t('ui.editHint')}
          >
            {block.rawInput || <span className="text-[var(--faint)]">{t('g.emptyProg')}</span>}
          </pre>
        )}

        {block.error ? (
          <div className="flex items-center gap-1.5 text-[12px] leading-5 text-[var(--danger)]" role="alert">
            <IWarn /> {block.error}
          </div>
        ) : block.resultLatex ? (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[13px] text-[var(--faint)]" aria-hidden="true">
              =
            </span>
            {resultHtml ? (
              <span className="text-[15px]" dangerouslySetInnerHTML={{ __html: resultHtml }} />
            ) : (
              <span className="math-input text-[13px] text-[var(--ink)]">{block.resultStr}</span>
            )}
            {block.definedVar && (
              <span className="math-input text-[11px] text-[var(--faint)]">→ {block.definedVar}</span>
            )}
          </div>
        ) : null}

        {/* trace-лог операторов trace */}
        {block.programTrace && block.programTrace.length > 0 && (
          <div className="mt-1 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] px-1.5 py-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--faint)]">{t('g.trace')}</div>
            {block.programTrace.map((line, k) => (
              <div key={k} className="math-input text-[12px] text-[var(--ink-soft)] whitespace-pre-wrap break-words">
                {line}
              </div>
            ))}
          </div>
        )}

        {/* отладчик: пошаговый прогон */}
        {showDebug && (
          <div
            className="mt-1 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] px-1.5 py-1 max-w-[60vw]"
            title={t('g.debugTitle')}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {debug?.error && (
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--danger)]" role="alert">
                <IWarn /> {debug.error}
              </div>
            )}
            {(!debug || (!debug.error && debug.steps.length === 0)) && (
              <div className="text-[12px] text-[var(--faint)]">{t('g.debugEmpty')}</div>
            )}
            {debug && debug.steps.length > 0 && (
              <div className="max-h-[180px] overflow-y-auto" role="list" aria-label={t('g.debugShow')}>
                {debug.steps.map((s) => (
                  <button
                    key={s.n}
                    type="button"
                    role="listitem"
                    onClick={() => setSelStep(s.n)}
                    className={`w-full text-left math-input text-[12px] px-1 py-px rounded flex items-baseline gap-1.5 cursor-pointer ${
                      selDebugStep?.n === s.n ? 'bg-white/10 text-[var(--ink)]' : 'text-[var(--ink-soft)] hover:bg-white/5'
                    }`}
                  >
                    <span className="text-[var(--faint)] shrink-0">#{s.n}·L{s.line}</span>
                    {s.kind === 'breakpoint' && (
                      <span className="text-[var(--danger)] shrink-0" aria-hidden="true">
                        ●
                      </span>
                    )}
                    <span className="truncate flex-1">{s.text}</span>
                    <span className="text-[var(--accent-ink)] shrink-0">= {s.value}</span>
                  </button>
                ))}
              </div>
            )}
            {debug?.truncated && <div className="text-[11px] text-[var(--faint)]">{t('g.debugTrunc', { n: debug.steps.length })}</div>}
            {selDebugStep && Object.keys(selDebugStep.locals).length > 0 && (
              <div className="mt-1 border-t border-[var(--line)] pt-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--faint)]">
                  {t('g.debugLocals')} · #{selDebugStep.n}
                </div>
                <div className="flex flex-wrap gap-x-2">
                  {Object.entries(selDebugStep.locals).map(([k, v]) => (
                    <span key={k} className="math-input text-[12px] text-[var(--ink-soft)]">
                      {k} <span className="text-[var(--accent-ink)]">= {v}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ProgramBlockView);
