import { useMemo, useState } from 'react';
import { SNIPPETS, type Snippet } from '../engine/packs';
import { useCanvasStore } from '../store/canvasStore';
import { IX } from './Icon';

const PACKS = ['Матрицы', 'Статистика', 'Физика', 'Телеком', 'Программы', 'Графики'];

export default function FunctionPalette({ onClose }: { onClose: () => void }) {
  const blocks = useCanvasStore((s) => s.blocks);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const [q, setQ] = useState('');

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return SNIPPETS;
    return SNIPPETS.filter(
      (s) =>
        s.label.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        s.hint.toLowerCase().includes(needle),
    );
  }, [q]);

  const place = () => {
    const list = Object.values(blocks);
    const maxY = list.reduce((m, b) => Math.max(m, b.y), 60);
    const maxX = list.length ? 80 : 200;
    return { x: maxX + ((list.length % 5) * 36), y: maxY + 100 };
  };

  const insert = (s: Snippet) => {
    const p = place();
    if (s.kind === 'plot') addPlotBlock(p.x + 420, Math.max(80, p.y - 160), s.code);
    else if (s.kind === 'program') addProgramBlock(p.x, p.y, s.code, s.exportName ?? '');
    else addBlock(p.x, p.y, s.code);
  };

  return (
    <div
      className="absolute left-2 top-[56px] z-30 w-[380px] max-w-[calc(100vw-16px)] max-h-[70vh] flex flex-col rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] shadow-2xl"
      role="dialog"
      aria-label="Палитра функций"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--chrome-line)]">
        <span className="text-[13px] font-semibold">ƒx Вставка</span>
        <label htmlFor="fx-search" className="sr-only">
          Поиск функции
        </label>
        <input
          id="fx-search"
          className="flex-1 min-h-[36px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1 text-[13px] outline-none focus:border-[var(--accent-line)]"
          placeholder="поиск: матрица, дБм, for…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button
          type="button"
          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[var(--chrome-soft)] hover:text-[var(--chrome-ink)] hover:bg-white/5"
          onClick={onClose}
          aria-label="Закрыть палитру"
        >
          <IX />
        </button>
      </div>
      <div className="overflow-y-auto p-2">
        {PACKS.map((pack) => {
          const rows = items.filter((s) => s.pack === pack);
          if (!rows.length) return null;
          return (
            <div key={pack} className="mb-2">
              <div className="text-[11px] uppercase tracking-wider text-[var(--chrome-soft)] px-1 mb-1">{pack}</div>
              {rows.map((s) => (
                <button
                  key={pack + s.label}
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-[var(--hover-line)] group cursor-pointer"
                  onClick={() => insert(s)}
                  title={s.hint}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px]">{s.label}</span>
                    <span className="text-[11px] text-[var(--chrome-soft)] truncate">{s.hint}</span>
                    <span className="ml-auto text-[var(--accent)] opacity-0 group-hover:opacity-100 text-[16px]" aria-hidden="true">
                      +
                    </span>
                  </div>
                  <div className="math-input text-[12px] text-[var(--accent-ink)]/80 truncate">
                    {s.code.split('\n')[0]}
                    {s.code.includes('\n') ? ' …' : ''}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
        {items.length === 0 && <div className="text-[13px] text-[var(--chrome-soft)] p-3">Ничего не найдено</div>}
      </div>
      <div className="px-3 py-1.5 border-t border-[var(--chrome-line)] text-[11px] text-[var(--chrome-soft)]">
        Матрицы: <span className="math-input">[1, 2; 3, 4]</span>, индекс <span className="math-input">A[1,2]</span> (с 1),
        диапазоны <span className="math-input">1..10</span>
      </div>
    </div>
  );
}
