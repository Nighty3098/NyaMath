import { memo, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import type { MathBlockData } from '../engine/dependencies';
import { useCanvasStore } from '../store/canvasStore';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IGrip, IResize, IX } from './Icon';

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
  const [editing, setEditing] = useState(block.rawInput === '');
  const [draft, setDraft] = useState(block.rawInput);
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

  const finishEdit = (value: string) => {
    if (value.trim() === '') removeBlock(block.id);
    else updateInput(block.id, value);
    setEditing(false);
  };

  return (
    <div className="weng-region absolute z-10" style={{ left: block.x, top: block.y }}>
      <div
        ref={regionRef}
        data-block-id={block.id}
        className={`weng-block relative rounded-[10px] pl-2.5 pr-1.5 py-1 border-l-[3px] transition-shadow group ${
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
        title="Программный блок: if/for/while (клик — редактировать • Shift+клик — в выделение)"
      >
        {/* ручка */}
        <span
          className="absolute -left-7 top-2 p-1.5 text-[var(--faint)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 select-none"
          style={{ opacity: selected ? 1 : undefined }}
          title="Тянуть для перемещения (группу — если выделено несколько)"
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
          title="Потянуть — ширина блока"
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
            Переменная для результата программы
          </label>
          <input
            id={`export-${block.id}`}
            className="math-input w-20 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)] select-text"
            value={block.exportName ?? ''}
            placeholder="имя"
            title="Переменная документа для результата (пусто — только вычислить)"
            onChange={(e) => setExportName(block.id, e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
          />
          <button
            type="button"
            className="ml-auto p-1 text-[var(--faint)] hover:text-[var(--danger)] cursor-pointer"
            title="Удалить (Del)"
            aria-label="Удалить программный блок"
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
            title="Клик — редактировать • Shift+клик — в выделение"
          >
            {block.rawInput || <span className="text-[var(--faint)]">// пустая программа</span>}
          </pre>
        )}

        {block.error ? (
          <div className="text-[12px] leading-5 text-[var(--danger)]" role="alert">
            ⚠ {block.error}
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
      </div>
    </div>
  );
}

export default memo(ProgramBlockView);
