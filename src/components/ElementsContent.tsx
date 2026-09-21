import { useMemo, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { findElement, listElements } from '../lib/db';
import { molarMassCode } from '../lib/elements';
import { t } from '../i18n';

/**
 * Вкладка «Элементы»: таблица Менделеева 1..118 из NyaMath.db.
 * Поиск по символу/номеру/ru-en названию, клик — молярная масса
 * определяемым блоком в точку прицела.
 */
export default function ElementsContent() {
  const addBlock = useCanvasStore((s) => s.addBlock);
  useCanvasStore((s) => s.blocks);
  const lang = useCanvasStore((s) => s.lang);
  const [q, setQ] = useState('');

  const all = useMemo(() => {
    try {
      return listElements();
    } catch {
      return [];
    }
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    const hit = findElement(q);
    if (hit) return [hit];
    return all.filter(
      (e) =>
        e.symbol.toLowerCase().includes(needle) ||
        e.name_en.toLowerCase().includes(needle) ||
        (e.name_ru ?? '').toLowerCase().includes(needle),
    );
  }, [all, q]);

  const insert = (symbol: string) => {
    const st = useCanvasStore.getState();
    const el = findElement(symbol);
    if (!el) return;
    const code = molarMassCode(el);
    if (!code) return;
    const p = { x: st.cross.x, y: st.cross.y };
    st.nudgeCross(0, 140);
    addBlock(p.x, p.y, code);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <label htmlFor="elements-search" className="sr-only">
          {t('el.search')}
        </label>
        <input
          id="elements-search"
          className="nya-input flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-[13px]"
          placeholder={t('el.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <span className="math-input tabular-nums text-[11px] text-[var(--chrome-soft)] shrink-0">{filtered.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-[var(--faint)]">{t('el.empty')}</div>
        )}
        {filtered.map((e) => (
          <button
            key={e.number}
            type="button"
            onClick={() => insert(e.symbol)}
            title={molarMassCode(e) ?? e.symbol}
            className="w-full flex items-center gap-2.5 px-3 py-[7px] text-left hover:bg-white/5 cursor-pointer"
          >
            <span className="math-input tabular-nums text-[11px] text-[var(--faint)] w-7 shrink-0">
              {e.number}
            </span>
            <span className="font-mono text-[14px] font-bold text-[var(--accent-line)] w-9 shrink-0">
              {e.symbol}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-[var(--chrome-ink)] truncate">
                {lang === 'ru' ? e.name_ru ?? e.name_en : e.name_en}
              </span>
              <span className="math-input block text-[11px] text-[var(--faint)] truncate tabular-nums">
                {e.atomic_mass ?? '—'}
                {e.phase ? ` · ${e.phase}` : ''}
                {e.electron_config ? ` · ${e.electron_config}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
