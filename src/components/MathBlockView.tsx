import { memo, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import type { MathBlockData } from '../engine/dependencies';
import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IGrip, IResize, IX } from './Icon';
import MiniPlot from './MiniPlot';

interface Props {
  block: MathBlockData;
  scale: number;
}

/**
 * Регион Mathcad: прозрачный фон, высота по содержимому, ширина — авто/вручную.
 * Присваивание `x := expr` — без результата, вывод — инлайн `expr = result`.
 * Пустой блок при выходе из редактирования (Enter/blur/Esc) удаляется.
 */
function MathBlockView({ block, scale }: Props) {
  const updateInput = useCanvasStore((s) => s.updateInput);
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);  const select = useCanvasStore((s) => s.select);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const [editing, setEditing] = useState(block.rawInput === '' && block.kind === 'math');
  const [draft, setDraft] = useState(block.rawInput);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, editing);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, regionRef);

  useEffect(() => {
    if (!editing) setDraft(block.rawInput);
  }, [block.rawInput, editing]);

  useEffect(() => {
    if (editing) {
      const el = (taRef.current ?? inputRef.current) as HTMLTextAreaElement | HTMLInputElement | null;
      el?.focus();
      const len = el?.value.length ?? 0;
      el?.setSelectionRange?.(len, len);
    }
  }, [editing]);

  // Печать с прицела: открыть редактор сразу после создания блока
  useEffect(() => {
    if (useCanvasStore.getState().consumePendingEdit(block.id)) {
      setDraft(block.rawInput);
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Инлайн-результат в стиле Mathcad: `expr = result` одной строкой KaTeX
  const tex = useMemo(() => {
    if (!block.displayLatex) return '';
    if (block.error || !block.isOutput || !block.resultLatex) return block.displayLatex;
    const lhs = block.displayLatex.replace(/=\s*$/, '').trim();
    return `${lhs} = ${block.resultLatex}`;
  }, [block.displayLatex, block.error, block.isOutput, block.resultLatex]);

  const html = useMemo(() => {
    if (!tex) return '';
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: false, strict: false });
    } catch {
      return '';
    }
  }, [tex]);

  const selected = selectedIds.includes(block.id);
  const isText = block.kind === 'text';
  const comment = isText ? block.rawInput.replace(/^(\/\/|#)\s?/, '') : '';

  const startEdit = () => {
    setDraft(block.rawInput);
    setEditing(true);
  };

  /** Выход из редактирования: пустое значение = удалить блок */
  const finishEdit = (value: string) => {
    if (value.trim() === '') removeBlock(block.id);
    else updateInput(block.id, value);
    setEditing(false);
  };

  /** Enter в редакторе: подтвердить и увести прицел строкой ниже (как в Mathcad) */
  const commitAndStepDown = (value: string) => {
    finishEdit(value);
    if (value.trim() !== '') {
      useCanvasStore.getState().setCross(block.x, block.y + 72);
    }
  };

  const onBodyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) toggleSelect(block.id);
    else {
      select(block.id);
      startEdit();
    }
  };

  return (
    <div className="weng-region absolute z-10" style={{ left: block.x, top: block.y }}>
      <div
        ref={regionRef}
        data-block-id={block.id}
        className={`weng-block relative rounded-[10px] px-1.5 py-0.5 transition-shadow group ${
          block.error
            ? 'shadow-[0_0_0_1.5px_var(--danger)] bg-[var(--danger-bg)]'
            : selected
              ? 'shadow-[0_0_0_1.5px_var(--accent-line)]'
              : 'hover:shadow-[0_0_0_1px_var(--hover-line)]'
        }`}
        style={block.w ? { width: block.w } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
        title={
          block.dependencies.length
            ? `${block.rawInput}\n${t('m.depends')} ${block.dependencies.join(', ')}`
            : block.rawInput
        }
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

        {editing ? (
          isText ? (
            <input
              ref={inputRef}
              className="math-input w-[440px] max-w-[60vw] bg-[var(--input-bg)] border border-[var(--accent-line)] rounded-lg px-1 py-0.5 text-[14px] text-[var(--ink)] outline-none select-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => finishEdit(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAndStepDown(draft);
                if (e.key === 'Escape') {
                  if (draft.trim() === '') removeBlock(block.id);
                  else {
                    setDraft(block.rawInput);
                    setEditing(false);
                  }
                }
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <textarea
              ref={taRef}
              rows={Math.min(4, Math.max(1, draft.split('\n').length))}
              className="math-input w-[440px] max-w-[60vw] bg-[var(--input-bg)] border border-[var(--accent-line)] rounded-lg px-1 py-0.5 text-[14px] text-[var(--ink)] outline-none resize-none select-text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                updateInput(block.id, e.target.value);
              }}
              onBlur={() => finishEdit(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitAndStepDown(draft);
                }
                if (e.key === 'Escape') {
                  if (draft.trim() === '') removeBlock(block.id);
                  else {
                    setDraft(block.rawInput);
                    setEditing(false);
                  }
                }
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="f := 10*10^9"
            />
          )
        ) : isText ? (
          <div
            className="text-[14px] leading-6 text-[var(--ink)] cursor-text whitespace-pre-wrap break-words"
            onClick={onBodyClick}
            title={t('ui.editHint')}
          >
            {comment || <span className="text-[var(--faint)]">{t('m.commentPh')}</span>}
          </div>
        ) : (
          <div className="cursor-text" onClick={onBodyClick} title={t('ui.editHint')}>
            {html ? (
              <div className="text-[17px] leading-8" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <div className="math-input text-[14px] text-[var(--ink)]">{block.rawInput || '—'}</div>
            )}
            {block.error && (
              <div className="text-[12px] leading-5 text-[var(--danger)]" role="alert">
                ⚠ {block.error}
              </div>
            )}
            {block.plotPreview && !block.error && (
              <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                <MiniPlot sample={block.plotPreview} />
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-[var(--faint)]">{t('m.autoplot')}</span>
                  <button
                    type="button"
                    className="ml-auto text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                    title={t('m.expandTitle')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (block.plotPreview) addPlotBlock(block.x, block.y + 260, block.plotPreview.expr);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {t('m.expandPlot')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MathBlockView);
