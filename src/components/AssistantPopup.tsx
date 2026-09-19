import { memo, useEffect, useRef } from 'react';
import type { AssistItem, AssistKind } from '../lib/assistant';
import { t } from '../i18n';

interface Props {
  items: AssistItem[];
  total: number;
  active: number;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
}

const KIND_DOT: Record<AssistKind, string> = {
  var: 'var(--accent-line)',
  fn: 'var(--ok)',
  unit: 'var(--warn, #d97706)',
  const: 'var(--faint)',
};

function kindLabel(kind: AssistKind): string {
  switch (kind) {
    case 'var':
      return t('da.var');
    case 'fn':
      return t('da.fn');
    case 'unit':
      return t('da.unit');
    case 'const':
      return t('da.const');
  }
}

/**
 * Выпадашка Dynamic Assistant под редактором: имя + значение/сигнатура,
 * активная строка с доком, фут-подсказка про клавиши.
 */
function AssistantPopup({ items, total, active, onPick, onHover }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const current = items[active] ?? null;

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (items.length === 0) return null;

  return (
    <div
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--input-bg)] shadow-lg"
      role="listbox"
      aria-label="Dynamic Assistant"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={listRef} className="max-h-[228px] overflow-y-auto py-1">
        {items.map((it, i) => (
          <div
            key={`${it.kind}:${it.name}`}
            role="option"
            aria-selected={i === active}
            data-active={i === active}
            className={`flex w-full cursor-pointer items-baseline gap-2 px-2.5 py-[5px] text-left ${
              i === active ? 'bg-white/10' : ''
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onPick(i);
            }}
            onMouseEnter={() => onHover(i)}
            title={`${kindLabel(it.kind)}${it.doc ? ` — ${it.doc}` : ''}`}
          >
            <span
              className="mt-[5px] h-2 w-2 shrink-0 self-start rounded-full"
              style={{ background: KIND_DOT[it.kind] }}
              aria-hidden="true"
            />
            <span className="shrink-0 font-mono text-[13px] font-bold text-[var(--ink)]">
              {it.name}
              {it.kind === 'fn' ? '()' : ''}
            </span>
            <span className="math-input ml-auto truncate text-[12px] tabular-nums text-[var(--faint)]">
              {it.detail}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--line)] px-2.5 py-1 text-[11px] leading-4 text-[var(--faint)]">
        {current?.doc ? (
          <span className="math-input mr-2 text-[var(--chrome-ink)]">{current.doc}</span>
        ) : null}
        <span>
          {t('da.hint')}
          {total > items.length ? ` • ${items.length}/${total}` : ''}
        </span>
      </div>
    </div>
  );
}

export default memo(AssistantPopup);
