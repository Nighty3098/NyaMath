import { useEffect, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';
import {
  IBlank,
  IContour,
  IFormula,
  IPlot,
  IPlot3d,
  IPlus,
  IProgram,
  ISignal,
  ISim,
  IX,
} from './Icon';

/**
 * Мобильная вставка блоков: FAB «+» + нижний шит.
 * На десктопе меню «Вставка» доступно из менюбара, поэтому FAB — только
 * на узких экранах (md:hidden). Вставляет в центр текущего вида, а не
 * в прицел: на телефоне прицел легко увезти за край экрана паном.
 */
export default function InsertSheet({ center }: { center: () => { x: number; y: number } }) {
  const [open, setOpen] = useState(false);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const entries: {
    icon: () => React.JSX.Element;
    label: string;
    add: (x: number, y: number) => void;
  }[] = (() => {
    const st = useCanvasStore.getState();
    return [
      { icon: IFormula, label: t('menu.insMath'), add: (x, y) => st.addBlock(x, y) },
      { icon: IBlank, label: t('menu.insText'), add: (x, y) => st.addTextBlock(x, y) },
      { icon: IPlot, label: t('menu.insPlot'), add: (x, y) => st.addPlotBlock(x, y) },
      {
        icon: IContour,
        label: t('menu.insContour'),
        add: (x, y) => st.addContourBlock(x, y),
      },
      { icon: IPlot3d, label: t('menu.ins3d'), add: (x, y) => st.addPlot3dBlock(x, y) },
      { icon: IProgram, label: t('menu.insProg'), add: (x, y) => st.addProgramBlock(x, y) },
      { icon: ISignal, label: t('menu.insSlider'), add: (x, y) => st.addSliderBlock(x, y) },
      { icon: ISim, label: t('menu.insSim'), add: (x, y) => st.addSimBlock(x, y) },
    ];
  })();

  const insert = (fn: (x: number, y: number) => void) => {
    const p = center();
    const x = Math.round(p.x - 40);
    const y = Math.round(p.y - 20);
    fn(x, y);
    useCanvasStore.getState().setCross(x, y);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="absolute right-3 z-30 md:hidden flex items-center justify-center w-12 h-12 rounded-full bg-[var(--accent-line)] text-white shadow-xl active:scale-95"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
        onClick={() => setOpen(true)}
        aria-label={t('menu.insert')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <IPlus />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label={t('menu.insert')}
        >
          <div
            className="absolute inset-0 bg-black/40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-2 right-2 rounded-2xl border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] shadow-2xl"
            style={{ bottom: 'calc(8px + env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <span className="flex-1 text-[15px] font-semibold">{t('menu.insert')}</span>
              <button
                type="button"
                className="nya-tbtn w-10 h-10"
                onClick={() => setOpen(false)}
                aria-label={t('ui.close')}
              >
                <IX />
              </button>
            </div>
            <div
              className="grid grid-cols-2 gap-1 p-2 overflow-y-auto"
              style={{ maxHeight: '60dvh' }}
            >
              {entries.map((e) => {
                const Icon = e.icon;
                return (
                  <button
                    key={e.label}
                    type="button"
                    className="flex items-center gap-2.5 min-h-[52px] px-3 rounded-xl text-left text-[14px] active:bg-[var(--accent-soft)]"
                    onClick={() => insert(e.add)}
                  >
                    <span className="text-[var(--accent-line)] shrink-0" aria-hidden="true">
                      <Icon />
                    </span>
                    {e.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
