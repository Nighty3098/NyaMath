import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';
import { IFormula, IPlot, IPlot3d, IProgram, ISim, IX, IZap, IDemo, IOpen, IBlank } from './Icon';

interface WelcomeModalProps {
  onClose: () => void;
  onOpenFile: () => void;
}

/**
 * Приветствие на пустом листе: быстрый старт в один клик.
 * Вход — stagger по смысловым чанкам (400ms ease-out, задержки 0/100/200ms),
 * выход — приглушённый (150ms ease-out, translateY −12px).
 */
export default function WelcomeModal({ onClose, onOpenFile }: WelcomeModalProps) {
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const loadTestScenario = useCanvasStore((s) => s.loadTestScenario);
  const loadAdvancedDemo = useCanvasStore((s) => s.loadAdvancedDemo);
  const addSimBlock = useCanvasStore((s) => s.addSimBlock);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, 150);
  };

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (fn: () => void) => () => {
    fn();
    close();
  };

  const quick: { icon: React.ReactNode; title: string; sub: string; fn: () => void }[] = [
    { icon: <IFormula />, title: t('w.formula'), sub: 'x := 5 · f(x) := …', fn: () => addBlock(220, 180) },
    { icon: <IPlot />, title: t('w.plot'), sub: t('w.plotSub'), fn: () => addPlotBlock(560, 180) },
    { icon: <IPlot3d />, title: t('w.plot3d'), sub: t('w.plot3dSub'), fn: () => addPlot3dBlock(560, 240) },
    { icon: <IProgram />, title: t('w.program'), sub: 'if · for · while', fn: () => addProgramBlock(240, 260) },
    { icon: <ISim />, title: t('menu.insSim'), sub: 'ODE · RK4', fn: () => addSimBlock(420, 300) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      {/* backdrop */}
      <div
        className="welcome-backdrop absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        data-closing={closing}
        onClick={close}
        aria-hidden="true"
      />
      {/* карточка: outer 20px = inner 12px + padding 8px */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('w.aria')}
        className={`welcome-card relative w-[820px] max-w-full rounded-[20px] p-2 border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] shadow-2xl ${closing ? 'welcome-exit' : ''}`}
      >
        <button
          ref={closeBtn}
          type="button"
          onClick={close}
          aria-label={t('w.close')}
          className="absolute right-3 top-3 p-2 rounded-lg text-[var(--chrome-soft)] hover:text-[var(--chrome-ink)] hover:bg-white/5 cursor-pointer transition-colors duration-150 ease-out active:scale-[0.96] z-10"
        >
          <IX />
        </button>

        <div className="flex flex-col sm:flex-row gap-2">
          {/* левая часть — логотип */}
          <div className="welcome-chunk welcome-d0 flex flex-1 items-center justify-center rounded-xl px-6 py-8">
            <img
              src="favicon.svg"
              alt=""
              aria-hidden="true"
              className="w-[90%] h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              draggable={false}
            />
          </div>

          {/* правая часть — название, создание, управление, создатель */}
          <div className="flex-1 min-w-0 rounded-xl px-5 py-4">
            <div className="welcome-chunk welcome-d0 pr-8">
              <div className="font-semibold tracking-tight text-[22px] leading-7">
                <span className="text-[var(--accent)]">W</span>engineering
              </div>
            </div>

            <div className="welcome-chunk welcome-d1 grid grid-cols-2 gap-2 mt-4">
              {quick.map((q) => (
                <button
                  key={q.title}
                  type="button"
                  onClick={start(q.fn)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--chrome-line)] px-3 py-2.5 text-left cursor-pointer transition-colors duration-150 ease-out hover:bg-white/5 active:scale-[0.96]"
                >
                  <span className="text-[var(--accent)]" aria-hidden="true">{q.icon}</span>
                  <span>
                    <span className="block text-[13px] font-medium">{q.title}</span>
                    <span className="math-input block text-[11px] text-[var(--chrome-soft)]">{q.sub}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="welcome-chunk welcome-d2 flex items-center gap-2 flex-wrap mt-3">
              <button
                type="button"
                onClick={start(loadTestScenario)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-[var(--accent-line)]/60 bg-[var(--accent-soft)] text-[13px] cursor-pointer transition-colors duration-150 ease-out hover:brightness-125 active:scale-[0.96]"
              >
                <IZap /> {t('w.demo1')}
              </button>
              <button
                type="button"
                onClick={start(loadAdvancedDemo)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-[var(--chrome-line)] text-[13px] cursor-pointer transition-colors duration-150 ease-out hover:bg-white/5 active:scale-[0.96]"
              >
                <IDemo /> {t('w.demo2')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenFile();
                  close();
                }}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-[var(--chrome-line)] text-[13px] cursor-pointer transition-colors duration-150 ease-out hover:bg-white/5 active:scale-[0.96]"
              >
                <IOpen /> {t('w.openFile')}
              </button>
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-[var(--chrome-line)] text-[13px] cursor-pointer transition-colors duration-150 ease-out hover:bg-white/5 active:scale-[0.96]"
              >
                <IBlank /> {t('w.blank')}
              </button>
            </div>

            <p className="welcome-chunk welcome-d2 text-[11px] text-[var(--chrome-soft)] mt-3">
              {t('w.creator')} <a href="https://github.com/Nighty3098">Nighty3098</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
