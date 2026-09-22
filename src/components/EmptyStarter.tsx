import { useCanvasStore } from '../store/canvasStore';
import { IFormula, IPlot, IZap } from './Icon';
import { t } from '../i18n';

/**
 * Стартер пустого холста (Desmos-паттерн): по центру — тихая карточка
 * с тремя чипами в один клик. Показывается, только если блоков нет
 * (приветствие уже закрыто). В печати скрыта.
 */
export default function EmptyStarter() {
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const loadQuickstart = useCanvasStore((s) => s.loadQuickstart);
  useCanvasStore((s) => s.lang);

  const chips: { icon: React.ReactNode; label: string; sub: string; fn: () => void }[] = [
    {
      icon: <IFormula />,
      label: 'x := 5',
      sub: t('w.formula'),
      fn: () => addBlock(220, 180, 'x := 5'),
    },
    {
      icon: <IPlot />,
      label: 'sin(x)',
      sub: t('w.plot'),
      fn: () => addPlotBlock(560, 180),
    },
    {
      icon: <IZap />,
      label: t('w.quick'),
      sub: t('w.quickSub'),
      fn: () => loadQuickstart(),
    },
  ];

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none print:hidden">
      <div
        className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-[var(--chrome)]/90 border border-[var(--chrome-line)] px-6 py-5 shadow-xl max-w-[92vw]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="text-[15px] font-semibold text-[var(--chrome-ink)]">
          {t('c.startTitle')}
        </div>
        <div className="text-[12px] text-[var(--chrome-soft)]">{t('c.startSub')}</div>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                c.fn();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border border-[var(--chrome-line)] text-[13px] text-[var(--chrome-soft)] hover:text-[var(--chrome-ink)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]/40 cursor-pointer transition-colors active:scale-[0.97]"
            >
              <span className="text-[var(--accent)] inline-flex" aria-hidden="true">
                {c.icon}
              </span>
              <span className="math-input font-medium">{c.label}</span>
              <span className="text-[11px] opacity-70">{c.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
