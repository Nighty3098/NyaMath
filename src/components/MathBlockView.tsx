import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import type { MathBlockData } from '../engine/dependencies';
import { useCanvasStore } from '../store/canvasStore';
import { t, type Lang } from '../i18n';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IGrip, ICheck, ICopy, IPause, IPlay, IPlot, IPlot3d, IWarn, IX } from './Icon';
import StaleChip from './StaleChip';
import { copyTextToClipboard } from '../lib/exportFiles';
import { applyColonShortcut } from '../lib/canvasLayout';
import { hoverNameOf, isVarRelated } from '../lib/varHighlight';
import { expandSelection, insertSnippet, skipCloser, wrapSelection } from '../lib/mathEdit';
import { lookupFuncDoc, wordAt } from '../lib/funcDoc';
import AssistantPopup from './AssistantPopup';
import {
  ASSIST_ALL_LIMIT,
  ASSIST_LIMIT,
  applyCompletion,
  prefixAt,
  queryAssistant,
  type AssistItem,
} from '../lib/assistant';
import { collectScopeVars } from '../lib/scopeVars';
import { TraceLine } from './TraceLine';
import MiniPlot from './MiniPlot';

/** Высота редактора под контент: rows знает только `\n`, а длинные формулы
 *  переносятся — без подстройки появляется внутренний скроллбар.
 *  Потолок — 8 строк (14px × 1.55 + паддинги ≈ 192px), дальше штатный скролл. */
const TA_MAX_H = 192;
function autosizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, TA_MAX_H)}px`;
  el.style.overflowY = el.scrollHeight > TA_MAX_H ? 'auto' : 'hidden';
}

interface Props {
  block: MathBlockData;
  scale: number;
  /** Use-before-definition : имена, определённые ниже по листу */
  lateDeps?: string[];
}

/**
 * Регион: прозрачный фон, высота по содержимому, ширина — авто/вручную.
 * Присваивание `x := expr` — без результата, вывод — инлайн `expr = result`.
 * Пустой блок при выходе из редактирования (Enter/blur/Esc) удаляется.
 */

/** Строка документации по функции под курсором (вместо статичной подсказки). */
function FuncDocLine({ draft, curPos, lang }: { draft: string; curPos: number; lang: Lang }) {
  const doc = useMemo(() => {
    const w = wordAt(draft, curPos);
    return w ? lookupFuncDoc(w, lang) : null;
  }, [draft, curPos, lang]);
  if (!doc) return null;
  return (
    <div
      className="math-input mt-1 truncate text-[11px] leading-4 text-[var(--faint)]"
      aria-live="polite"
    >
      <span className="text-[var(--accent-line)]">{doc.name}</span>
      {doc.title === doc.name ? ` — ${doc.syntax}` : ` — ${doc.title} · ${doc.syntax}`}
    </div>
  );
}

function MathBlockView({ block, scale, lateDeps }: Props) {
  const updateInput = useCanvasStore((s) => s.updateInput);
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const toggleBlockDisabled = useCanvasStore((s) => s.toggleBlockDisabled);
  const setBlockVisibility = useCanvasStore((s) => s.setBlockVisibility);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const select = useCanvasStore((s) => s.select);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const hoveredVar = useCanvasStore((s) => s.hoveredVar);
  const setHoveredVar = useCanvasStore((s) => s.setHoveredVar);
  const setEditingId = useCanvasStore((s) => s.setEditingId);
  const kbInsert = useCanvasStore((s) => s.kbInsert);
  const lang = useCanvasStore((s) => s.lang);
  const [editing, setEditing] = useState(block.rawInput === '' && block.kind === 'math');
  const [draft, setDraft] = useState(block.rawInput);
  const [curPos, setCurPos] = useState(0);
  const [copied, setCopied] = useState(false);
  /** Dynamic Assistant: варианты под префиксом + активная строка */
  const [assist, setAssist] = useState<{
    items: AssistItem[];
    total: number;
    active: number;
  } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  /** Clickable Math (по-Maple): контекстное меню действий с блоком */
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const ctxFirstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ctx) ctxFirstRef.current?.focus();
  }, [ctx]);

  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, editing);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, regionRef);

  useEffect(() => {
    if (!editing) setDraft(block.rawInput);
  }, [block.rawInput, editing]);

  useEffect(() => {
    if (editing) {
      const el = (taRef.current ?? inputRef.current) as
        HTMLTextAreaElement | HTMLInputElement | null;
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

  // Высота редактора — по контенту (переносы длинных формул тоже считаются)
  useEffect(() => {
    if (editing) autosizeTextarea(taRef.current);
  }, [editing, draft]);

  // Экранная клавиатура: регистрируем открытый редактор как приёмник вставки
  useEffect(() => {
    if (!editing) return;
    setEditingId(block.id);
    return () => {
      const st = useCanvasStore.getState();
      if (st.editingId === block.id) st.setEditingId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, block.id]);

  // Вставка с экранной клавиатуры в позицию курсора открытого редактора
  const kbSeq = kbInsert?.seq ?? 0;
  useEffect(() => {
    if (!editing || !kbInsert || kbInsert.id !== block.id) return;
    const el = (taRef.current ?? inputRef.current) as HTMLTextAreaElement | HTMLInputElement | null;
    const s = el?.selectionStart ?? draft.length;
    const e = el?.selectionEnd ?? s;
    const r = insertSnippet(draft, s, e, kbInsert.text);
    setDraft(r.value);
    updateInput(block.id, r.value);
    setCurPos(r.cursor);
    refreshAssist(r.value, r.cursor);
    requestAnimationFrame(() => {
      el?.setSelectionRange?.(r.cursor, r.cursor);
      el?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbSeq]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  /** Dynamic Assistant: пересчитать варианты под курсором (forceAll — F12, весь список) */
  const refreshAssist = (value: string, pos: number, forceAll = false) => {
    if (block.kind === 'text') {
      setAssist(null);
      return;
    }
    const p = prefixAt(value, pos);
    if (!p && !forceAll) {
      setAssist(null);
      return;
    }
    const vars = collectScopeVars(useCanvasStore.getState().blocks);
    const q = queryAssistant(
      p ? p.word : '',
      vars,
      lang,
      forceAll ? ASSIST_ALL_LIMIT : ASSIST_LIMIT,
    );
    if (q.items.length === 0) {
      setAssist(null);
      return;
    }
    setAssist({ items: q.items, total: q.total, active: 0 });
  };

  /** Вставить активный вариант ассистента */
  const acceptAssist = (index: number) => {
    const el = taRef.current;
    if (!el || !assist) return;
    const pos = el.selectionStart ?? draft.length;
    const item = assist.items[index];
    if (!item) return;
    const r = applyCompletion(draft, pos, item);
    setDraft(r.value);
    updateInput(block.id, r.value);
    setCurPos(r.cursor);
    setAssist(null);
    requestAnimationFrame(() => {
      el.setSelectionRange?.(r.cursor, r.cursor);
      el.focus();
    });
  };

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

  // Инлайн-результат Calcpad-стиля: `expr = subst = result` одной строкой KaTeX
  const tex = useMemo(() => {
    if (!block.displayLatex) return '';
    const lhs = block.displayLatex.replace(/=\s*$/, '').trim();
    // Матрицы/векторы показываем отдельной таблицей, в формуле оставляем только `=`.
    if (block.resultTable) return block.isOutput && !block.error ? `${lhs} =` : block.displayLatex;
    if (block.error || !block.isOutput || !block.resultLatex) return block.displayLatex;
    const subst = block.kind === 'math' ? (block.substLatex ?? '').trim() : '';
    if (subst) return `${lhs} = ${subst} = ${block.resultLatex}`;
    return `${lhs} = ${block.resultLatex}`;
  }, [
    block.displayLatex,
    block.error,
    block.isOutput,
    block.resultLatex,
    block.resultTable,
    block.kind,
    block.substLatex,
  ]);

  const html = useMemo(() => {
    if (!tex) return '';
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode: false,
        strict: false,
      });
    } catch {
      return '';
    }
  }, [tex]);
  const hasMatrix = /\\begin\{(?:smallmatrix|[pbBvV]?matrix|array)\}/i.test(tex);

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
    if (v.kind === 'vector') addPlotBlock(block.x, block.y + 260, v.expr, { plotTrace: 'arrow' });
    else addPlot3dBlock(block.x, block.y + 420, v.expr);
  };

  /** Выход из редактирования: пустое значение = удалить блок */
  const finishEdit = (value: string) => {
    if (value.trim() === '') removeBlock(block.id);
    else updateInput(block.id, value);
    setAssist(null);
    setEditing(false);
  };

  /** Enter в редакторе: подтвердить и увести прицел строкой ниже */
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
    <div
      className={`nya-region absolute ${editing ? 'z-20' : 'z-10'}`}
      style={{ left: block.x, top: block.y }}
      data-visibility={block.visibility ?? 'show'}
      onMouseEnter={() => {
        if (!editing) setHoveredVar(hoverNameOf(block));
      }}
      onMouseLeave={() => setHoveredVar(null)}
      onContextMenu={(e) => {
        if (editing) return;
        e.preventDefault();
        e.stopPropagation();
        select(block.id);
        setCtx({
          x: Math.min(e.clientX, window.innerWidth - 250),
          y: Math.min(e.clientY, window.innerHeight - 300),
        });
      }}
    >
      <div
        ref={regionRef}
        data-block-id={block.id}
        className={`nya-block relative rounded-xl group ${block.disabled ? 'opacity-60 saturate-50' : ''} ${
          editing ? 'p-3' : 'px-2 py-1'
        } ${
          block.error
            ? 'outline outline-2 outline-[var(--danger)] bg-[var(--danger-bg)]'
            : editing
              ? // Active region — пунктирная рамка + сплошной фон на весь блок
                'bg-[var(--input-bg)] outline outline-2 outline-dashed outline-[var(--accent-line)]'
              : selected
                ? 'outline outline-2 outline-[var(--accent-line)]'
                : isVarRelated(block, hoveredVar)
                  ? // та же переменная под курсором — подсветка по всему листу
                    'outline outline-2 outline-[var(--accent-line)] bg-[var(--accent-soft)]/40'
                  : 'hover:outline hover:outline-1 hover:outline-[var(--hover-line)]'
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
        {/* тулбар действий: ряд справа от блока, на его горизонтали.
            min-width auto; кнопки идут слева направо, gap 10px */}
        {!editing && (
          <div
            role="toolbar"
            aria-label={t('m.actions')}
            className="absolute left-full top-1/2 z-10 ml-[6px] flex min-w-auto -translate-y-1/2 flex-row items-center justify-start gap-[10px] opacity-0 group-hover:opacity-100"
            style={{
              minWidth: 'auto',
              opacity: selected || block.disabled || copied ? 1 : undefined,
            }}
          >
            <button
              type="button"
              className="p-1 leading-none text-[var(--faint)] hover:text-[var(--danger)] cursor-pointer"
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
            <button
              type="button"
              className={`p-1 leading-none cursor-pointer ${
                block.disabled
                  ? 'text-[var(--accent-line)]'
                  : 'text-[var(--faint)] hover:text-[var(--accent-line)]'
              }`}
              title={block.disabled ? t('m.enable') : t('m.disable')}
              aria-label={block.disabled ? t('m.enable') : t('m.disable')}
              aria-pressed={block.disabled}
              onClick={(e) => {
                e.stopPropagation();
                toggleBlockDisabled(block.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] leading-4" aria-hidden="true">
                {block.disabled ? <IPlay /> : <IPause />}
              </span>
            </button>
            <button
              type="button"
              className="p-1 leading-none text-[var(--faint)] hover:text-[var(--accent-line)] cursor-pointer"
              title={copied ? t('m.copied') : t('m.copyTex')}
              aria-label={t('m.copyTex')}
              onClick={(e) => {
                e.stopPropagation();
                doCopyTex();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {copied ? (
                <span className="text-[13px] leading-4 text-[var(--ok)]">
                  <ICheck />
                </span>
              ) : (
                <ICopy />
              )}
            </button>
            {block.visualize && (
              <button
                type="button"
                className="p-1 leading-none text-[var(--faint)] hover:text-[var(--accent-line)] cursor-pointer"
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
          </div>
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
            <>
              <div className="relative">
                <textarea
                  ref={taRef}
                  rows={1}
                  className="math-input nya-editor select-text"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    autosizeTextarea(e.currentTarget);
                    const pos = e.target.selectionStart ?? e.target.value.length;
                    setCurPos(pos);
                    updateInput(block.id, e.target.value);
                    refreshAssist(e.target.value, pos);
                  }}
                  onBlur={() => finishEdit(draft)}
                  onKeyDown={(e) => {
                    const el = e.currentTarget;
                    const selS = el.selectionStart ?? draft.length;
                    const selE = el.selectionEnd ?? draft.length;
                    // F12 — Dynamic Assistant: весь список (переменные • функции • единицы)
                    if (e.key === 'F12') {
                      e.preventDefault();
                      refreshAssist(draft, selS, true);
                      e.stopPropagation();
                      return;
                    }
                    // Навигация по ассистенту имеет приоритет над редактированием
                    if (assist && assist.items.length > 0) {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const d = e.key === 'ArrowDown' ? 1 : -1;
                        const n = assist.items.length;
                        setAssist({
                          ...assist,
                          active: (assist.active + d + n) % n,
                        });
                        e.stopPropagation();
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        acceptAssist(assist.active);
                        e.stopPropagation();
                        return;
                      }
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        acceptAssist(assist.active);
                        e.stopPropagation();
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setAssist(null);
                        e.stopPropagation();
                        return;
                      }
                    }
                    // Tab без ассистента — tab-stop сниппетов: перепрыгнуть `)`/`]`.
                    // Иначе — штатный Tab (навигация фокуса, a11y не ломаем).
                    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      const jump = selS === selE ? skipCloser(draft, selS) : null;
                      if (jump !== null) {
                        e.preventDefault();
                        setCurPos(jump);
                        refreshAssist(draft, jump);
                        requestAnimationFrame(() => {
                          el.setSelectionRange?.(jump, jump);
                        });
                        e.stopPropagation();
                        return;
                      }
                    }
                    // Ctrl+Space — расширение выделения уровнями (уровни группировки)
                    if (e.key === ' ' && e.ctrlKey && !e.metaKey && !e.altKey) {
                      const r = expandSelection(draft, selS, selE);
                      if (r) {
                        e.preventDefault();
                        requestAnimationFrame(() => {
                          el.setSelectionRange?.(r.start, r.end);
                        });
                      }
                      e.stopPropagation();
                      return;
                    }
                    // ( / ^ поверх выделения — оператор накрывает группу целиком
                    if (
                      (e.key === '(' || e.key === '/' || e.key === '^') &&
                      selE > selS &&
                      !e.ctrlKey &&
                      !e.metaKey &&
                      !e.altKey
                    ) {
                      const kind = e.key === '(' ? 'parens' : e.key === '/' ? 'fraction' : 'power';
                      const r = wrapSelection(draft, selS, selE, kind);
                      if (r) {
                        e.preventDefault();
                        setDraft(r.value);
                        updateInput(block.id, r.value);
                        requestAnimationFrame(() => {
                          el.setSelectionRange?.(r.start, r.end);
                        });
                        e.stopPropagation();
                        return;
                      }
                    }
                    // Клавиша `:` сразу даёт оператор определения `:=`
                    if (e.key === ':' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      const el = e.currentTarget;
                      const r = applyColonShortcut(
                        draft,
                        el.selectionStart ?? draft.length,
                        el.selectionEnd ?? draft.length,
                      );
                      if (r) {
                        e.preventDefault();
                        setDraft(r.value);
                        updateInput(block.id, r.value);
                        const cursor = r.cursor;
                        requestAnimationFrame(() => {
                          el.setSelectionRange?.(cursor, cursor);
                        });
                        e.stopPropagation();
                        return;
                      }
                    }
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
                  onKeyUp={(e) => setCurPos(e.currentTarget.selectionStart ?? draft.length)}
                  onSelect={(e) => setCurPos(e.currentTarget.selectionStart ?? draft.length)}
                  placeholder="f := 10*10^9"
                  aria-label={t('m.groupHint')}
                />
                {editing && assist && assist.items.length > 0 && (
                  <AssistantPopup
                    items={assist.items}
                    total={assist.total}
                    active={assist.active}
                    onPick={acceptAssist}
                    onHover={(i) =>
                      setAssist((prev) =>
                        prev && prev.active !== i ? { ...prev, active: i } : prev,
                      )
                    }
                  />
                )}
              </div>
              {/* документация по функции под курсором вместо статичной подсказки */}
              <FuncDocLine draft={draft} curPos={curPos} lang={lang} />
              {/* живой предпросмотр «как в книге» прямо при наборе */}
              {draft.trim() !== '' && html !== '' && (
                <div className="mt-1 opacity-70 pointer-events-none select-none" aria-hidden="true">
                  <div
                    className="text-[17px] leading-8"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              )}
            </>
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
              <div
                className={`text-[17px] leading-8 max-w-full ${
                  hasMatrix ? 'overflow-x-auto' : 'nya-math-wrap'
                }`}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="math-input text-[14px] text-[var(--ink)]">
                {block.rawInput || '—'}
              </div>
            )}
            {block.resultTable && !block.error && (
              <div
                className="mt-1 min-w-0 max-w-full font-mono text-[11px] leading-4 text-[var(--ink)]"
                title={`${t('m.matrixTable', {
                  rows: block.resultTable.rowCount,
                  cols: block.resultTable.colCount,
                })}${block.resultTable.truncated ? ` — ${t('m.matrixTruncated')}` : ''}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex min-w-0 max-w-full items-stretch gap-1 rounded-md bg-[var(--input-bg)]/60 px-1.5 py-1">
                  <span className="flex select-none items-center text-[var(--faint)]">[</span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {block.resultTable.rows.map((row, r) => (
                      <div key={r} className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
                        {row.map((cell, c) => (
                          <span
                            key={c}
                            title={cell}
                            className="inline-block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap align-top tabular-nums"
                          >
                            {cell}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                  <span className="flex select-none items-center text-[var(--faint)]">]</span>
                </div>
              </div>
            )}
            {block.error && (
              <div
                className="flex items-center gap-1.5 text-[12px] leading-5 text-[var(--danger)]"
                role="alert"
              >
                <IWarn /> {block.error}
              </div>
            )}
            {block.disabled && (
              <div className="text-[11px] leading-5 text-[var(--faint)] flex items-center gap-1">
                <IPause /> {t('m.disabled')}
              </div>
            )}
            {(block.visibility ?? 'show') !== 'show' && (
              <div className="text-[11px] leading-5 text-[var(--faint)]">
                {t('m.visLabel', {
                  v:
                    block.visibility === 'hide'
                      ? t('m.visHide')
                      : block.visibility === 'input'
                        ? t('m.visInput')
                        : t('m.visResult'),
                })}
              </div>
            )}
            {!block.disabled && lateDeps && lateDeps.length > 0 && (
              <div
                className="flex items-center gap-1.5 text-[12px] leading-5 text-[var(--accent-line)]"
                role="note"
              >
                <IWarn /> {t('m.useBeforeDef', { names: lateDeps.join(', ') })}
              </div>
            )}
            <StaleChip id={block.id} />
            {/* шаговый лог решателей (nlsolve/root/nint/…) — и при ошибке сходимости */}
            {block.solverTrace && block.solverTrace.length > 0 && (
              <div className="mt-1 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] px-1.5 py-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--faint)]">
                  {t('m.solveTrace')}
                </div>
                {block.solverTrace.map((line, k) => (
                  <TraceLine key={k} line={line} prominent={k === 0} />
                ))}
              </div>
            )}
            {block.plotPreview && !block.error && (
              <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                {block.plotPreview.source === 'vector' && (
                  <div className="mt-1">
                    <MiniPlot sample={block.plotPreview} />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    className="ml-auto text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                    title={t('m.expandTitle')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (block.plotPreview)
                        addPlotBlock(
                          block.x,
                          block.y + 260,
                          block.plotPreview.expr,
                          block.plotPreview.source === 'vector'
                            ? { plotTrace: 'arrow' }
                            : undefined,
                        );
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
      {ctx &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-50 print:hidden"
              onContextMenu={(e) => {
                e.preventDefault();
                setCtx(null);
              }}
              onClick={() => setCtx(null)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <div
              role="menu"
              aria-label={t('m.actions')}
              className="fixed z-50 min-w-[220px] rounded-xl border border-[var(--line)] bg-[var(--sheet)] p-1 shadow-xl print:hidden"
              style={{ left: ctx.x, top: ctx.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setCtx(null);
                }
                e.stopPropagation();
              }}
            >
              <CtxItem
                label={t('m.ctxEdit')}
                firstRef={ctxFirstRef}
                onRun={() => {
                  setCtx(null);
                  startEdit();
                }}
              />
              {block.plotPreview && !block.error && (
                <CtxItem
                  label={t('m.expandPlot')}
                  onRun={() => {
                    setCtx(null);
                    if (block.plotPreview)
                      addPlotBlock(
                        block.x,
                        block.y + 260,
                        block.plotPreview.expr,
                        block.plotPreview.source === 'vector'
                          ? { plotTrace: 'arrow' }
                          : undefined,
                      );
                  }}
                />
              )}
              {block.visualize && (
                <CtxItem
                  label={t('m.visualize')}
                  onRun={() => {
                    setCtx(null);
                    doVisualize();
                  }}
                />
              )}
              <CtxItem
                label={t('m.copyTex')}
                onRun={() => {
                  setCtx(null);
                  doCopyTex();
                }}
              />
              <CtxItem
                label={block.disabled ? t('m.enable') : t('m.disable')}
                onRun={() => {
                  setCtx(null);
                  toggleBlockDisabled(block.id);
                }}
              />
              <CtxItem
                label={t('m.visLabel', { v: t('m.visShow') })}
                onRun={() => {
                  setCtx(null);
                  setBlockVisibility(block.id, 'show');
                }}
              />
              <CtxItem
                label={t('m.visLabel', { v: t('m.visHide') })}
                onRun={() => {
                  setCtx(null);
                  setBlockVisibility(block.id, 'hide');
                }}
              />
              <CtxItem
                label={t('m.visLabel', { v: t('m.visInput') })}
                onRun={() => {
                  setCtx(null);
                  setBlockVisibility(block.id, 'input');
                }}
              />
              <CtxItem
                label={t('m.visLabel', { v: t('m.visResult') })}
                onRun={() => {
                  setCtx(null);
                  setBlockVisibility(block.id, 'result');
                }}
              />
              <CtxItem
                label={t('m.ctxInsertBelow')}
                onRun={() => {
                  setCtx(null);
                  addBlock(block.x, block.y + 72);
                }}
              />
              <CtxItem
                label={t('m.deleteBlock')}
                danger
                onRun={() => {
                  setCtx(null);
                  removeBlock(block.id);
                }}
              />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function CtxItem({
  label,
  onRun,
  danger,
  firstRef,
}: {
  label: string;
  onRun: () => void;
  danger?: boolean;
  firstRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={firstRef}
      type="button"
      role="menuitem"
      className={`w-full text-left px-3 min-h-[34px] py-1.5 rounded-lg text-[13px] cursor-pointer hover:bg-[var(--accent-line)]/15 ${
        danger ? 'text-[var(--danger)]' : 'text-[var(--ink)]'
      }`}
      onClick={onRun}
    >
      {label}
    </button>
  );
}

export default memo(MathBlockView);
