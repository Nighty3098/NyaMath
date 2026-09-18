import { memo, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import type { MathBlockData } from '../engine/dependencies';
import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IGrip, ICopy, IPlot, IPlot3d, IWarn, IX } from './Icon';
import MiniPlot from './MiniPlot';
import { copyTextToClipboard } from '../lib/exportFiles';

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
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const select = useCanvasStore((s) => s.select);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const [editing, setEditing] = useState(block.rawInput === '' && block.kind === 'math');
  const [draft, setDraft] = useState(block.rawInput);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, editing);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, regionRef);

  // Реальная высота блока: кнопка копирования встаёт к низу, только если обе
  // боковые кнопки (~34px с тач-паддингами) помещаются без наложения.
  const [boxH, setBoxH] = useState<number | null>(null);
  useEffect(() => {
    const el = regionRef.current;
    if (!el) return;
    const measure = () => setBoxH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const estShort = !block.error && !block.plotPreview && !block.rawInput.includes('\n');
  const copyAtBottom = (boxH ?? (estShort ? 0 : 200)) >= 76;

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

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  /** Копировать формулу как LaTeX (результат — если есть) */
  const doCopyTex = () => {
    const src = tex || block.rawInput;
    if (!src) return;
    void copyTextToClipboard(src).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1200);
    });
  };

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

  /** Умная визуализация: f(x,y) → 3D, вектор → 2D по индексу, матрица → 3D */
  const doVisualize = () => {
    const v = block.visualize;
    if (!v || editing) return;
    if (v.kind === 'vector') addPlotBlock(block.x, block.y + 260, v.expr);
    else addPlot3dBlock(block.x, block.y + 420, v.expr);
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
    <div className="nya-region absolute z-10" style={{ left: block.x, top: block.y }}>
      <div
        ref={regionRef}
        data-block-id={block.id}
        className={`nya-block relative rounded-xl px-2 py-1 transition-shadow group ${
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
        {!editing && (
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
        )}
        {/* удаление */}
        {!editing && (
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
        )}
        {/* копировать LaTeX */}
        {!editing && (
          <button
            type="button"
            className={`absolute -right-7 ${copyAtBottom ? 'bottom-0' : 'top-10'} z-10 p-1.5 text-[var(--faint)] hover:text-[var(--accent-line)] opacity-0 group-hover:opacity-100 cursor-pointer`}
            style={{ opacity: selected || copied ? 1 : undefined }}
            title={copied ? t('m.copied') : t('m.copyTex')}
            aria-label={t('m.copyTex')}
            onClick={(e) => {
              e.stopPropagation();
              doCopyTex();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {copied ? <span className="text-[13px] leading-4 text-[var(--ok)]">✓</span> : <ICopy />}
          </button>
        )}
        {/* визуализация результата: только когда автографик неприменим */}
        {!editing && block.visualize && (
          <button
            type="button"
            className={`absolute -right-7 ${copyAtBottom ? 'bottom-10' : 'top-20'} z-10 p-1.5 text-[var(--faint)] hover:text-[var(--accent-line)] opacity-0 group-hover:opacity-100 cursor-pointer`}
            style={{ opacity: selected ? 1 : undefined }}
            title={t('m.visualize')}
            aria-label={t('m.visualize')}
            onClick={(e) => {
              e.stopPropagation();
              doVisualize();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {block.visualize.kind === 'vector' ? <IPlot /> : <IPlot3d />}
          </button>
        )}
        {/* ручка ширины */}
        {!editing && (
        <span
          className="absolute -right-3 -bottom-3 w-7 h-7 cursor-nwse-resize touch-none select-none"
          title={t('ui.resizeW')}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
        )}

        {editing ? (
          isText ? (
            <input
              ref={inputRef}
              className="math-input nya-editor select-text"
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
              rows={Math.min(8, Math.max(1, draft.split('\n').length))}
              className="math-input nya-editor select-text"
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
              <div className="flex items-center gap-1.5 text-[12px] leading-5 text-[var(--danger)]" role="alert">
                <IWarn /> {block.error}
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
