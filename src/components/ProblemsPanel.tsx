import { useMemo } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { focusBlock } from '../lib/focusBlock';
import { IWarn, IX } from './Icon';
import { t } from '../i18n';

const snippetOf = (raw: string): string => {
  const line = raw.split('\n')[0]?.trim() ?? '';
  return line.length > 60 ? line.slice(0, 59) + '…' : line || '…';
};

/**
 * Панель Problems в духе VS Code: список ошибок листа с переходом
 * к блоку по клику. Открывается из меню «Вид» или Ctrl+Shift+M.
 */
export default function ProblemsPanel({ onClose }: { onClose: () => void }) {
  const blocks = useCanvasStore((s) => s.blocks);
  useCanvasStore((s) => s.lang);

  const errs = useMemo(
    () =>
      Object.values(blocks)
        .filter((b) => b.error)
        .sort((a, b) => a.y - b.y),
    [blocks],
  );

  return (
    <section
      className="shrink-0 max-h-[28vh] flex flex-col bg-[var(--chrome)] border-t border-[var(--chrome-line)] print:hidden"
      aria-label={t('menu.problems')}
    >
      <div className="shrink-0 flex items-center gap-2 px-3 min-h-[32px]">
        <span className="text-[11px] uppercase tracking-wider text-[var(--faint)]">
          {t('menu.problems')} · {errs.length}
        </span>
        <button
          type="button"
          className="nya-tbtn w-7 h-7 ml-auto"
          onClick={onClose}
          aria-label={t('prob.close')}
          title={t('prob.close')}
        >
          <IX />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pb-1">
        {errs.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-[var(--faint)]">{t('prob.empty')}</div>
        ) : (
          errs.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => focusBlock(b.id)}
              title={t('nv.goto')}
              className="w-full flex items-baseline gap-2 px-3 py-[6px] text-left hover:bg-white/5 cursor-pointer"
            >
              <span
                className="text-[var(--danger)] inline-flex shrink-0 self-center"
                aria-hidden="true"
              >
                <IWarn />
              </span>
              <span className="font-mono text-[12px] text-[var(--chrome-ink)] truncate shrink-0 max-w-[40%]">
                {snippetOf(b.rawInput)}
              </span>
              <span className="text-[12px] text-[var(--danger)] truncate flex-1">{b.error}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
