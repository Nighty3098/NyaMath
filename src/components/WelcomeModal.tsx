import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { t } from "../i18n";
import {
  IFormula,
  IPlot,
  IPlot3d,
  IProgram,
  ISim,
  IZap,
  IDemo,
  IOpen,
  IBlank,
} from "./Icon";

interface WelcomeModalProps {
  onClose: () => void;
  onOpenFile: () => void;
}

/**
 * Приветствие на пустом листе: быстрый старт в один клик.
 * Минимализм: одна колонка, тихая типографика, спокойные кнопки.
 * Вход — stagger по смысловым чанкам, выход — приглушённый.
 */
export default function WelcomeModal({
  onClose,
  onOpenFile,
}: WelcomeModalProps) {
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const loadTestScenario = useCanvasStore((s) => s.loadTestScenario);
  const loadAdvancedDemo = useCanvasStore((s) => s.loadAdvancedDemo);
  const loadQuickstart = useCanvasStore((s) => s.loadQuickstart);
  const addSimBlock = useCanvasStore((s) => s.addSimBlock);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, 150);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (fn: () => void) => () => {
    fn();
    close();
  };

  const quick: {
    icon: React.ReactNode;
    title: string;
    sub: string;
    fn: () => void;
  }[] = [
    {
      icon: <IFormula />,
      title: t("w.formula"),
      sub: "x := 5 · f(x) := …",
      fn: () => addBlock(220, 180),
    },
    {
      icon: <IPlot />,
      title: t("w.plot"),
      sub: t("w.plotSub"),
      fn: () => addPlotBlock(560, 180),
    },
    {
      icon: <IPlot3d />,
      title: t("w.plot3d"),
      sub: t("w.plot3dSub"),
      fn: () => addPlot3dBlock(560, 240),
    },
    {
      icon: <IProgram />,
      title: t("w.program"),
      sub: "if · for · while",
      fn: () => addProgramBlock(240, 260),
    },
    {
      icon: <ISim />,
      title: t("menu.insSim"),
      sub: "ODE · RK4",
      fn: () => addSimBlock(420, 300),
    },
  ];

  const ghostBtn =
    "inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg border border-[var(--chrome-line)] text-[13px] text-[var(--chrome-soft)] hover:text-[var(--chrome-ink)] cursor-pointer transition-colors duration-150 ease-out active:scale-[0.97]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      {/* backdrop */}
      <div
        className="welcome-backdrop absolute inset-0 bg-black/45"
        data-closing={closing}
        onClick={close}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("w.aria")}
        className={`welcome-card relative w-[840px] max-w-full max-h-[92dvh] overflow-y-auto rounded-[18px] border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] px-7 py-6 ${closing ? "welcome-exit" : ""}`}
      >
        <div className="grid grid-cols-1 items-center gap-x-8 gap-y-4 md:grid-cols-[auto_1fr]">
          <div className="welcome-chunk welcome-d0 flex flex-col items-center justify-center">
            <img
              src="/favicon.svg"
              alt="NyaMath"
              className="h-[312px] w-[312px] max-w-full"
            />
          </div>
          <div className="min-w-0">
            <div className="welcome-chunk welcome-d0">
              <span className="font-semibold tracking-tight text-[19px]">
                NyaMath
              </span>
            </div>
            <p className="welcome-chunk welcome-d0 text-[13px] leading-5 text-[var(--chrome-soft)] mt-1.5">
              {t("w.tag")}
            </p>

            <div className="welcome-chunk welcome-d1 grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2 mt-5">
              <button
                type="button"
                onClick={start(loadQuickstart)}
                className="flex flex-col gap-1 rounded-xl border-2 border-[var(--accent-line)] bg-[var(--accent-soft)]/40 px-3 py-3 text-left cursor-pointer transition-colors duration-150 ease-out hover:bg-[var(--accent-soft)]/70 active:scale-[0.97] min-[420px]:col-span-2 sm:col-span-3"
              >
                <span className="text-[var(--accent)]" aria-hidden="true">
                  <IZap />
                </span>
                <span className="block text-[13px] font-medium leading-4">
                  {t("w.quick")}
                </span>
                <span className="math-input block text-[11px] leading-4 text-[var(--chrome-soft)] truncate">
                  {t("w.quickSub")}
                </span>
              </button>
              {quick.map((q) => (
                <button
                  key={q.title}
                  type="button"
                  onClick={start(q.fn)}
                  className="flex flex-col gap-1 rounded-xl border border-[var(--chrome-line)] px-3 py-3 text-left cursor-pointer transition-colors duration-150 ease-out hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]/40 active:scale-[0.97]"
                >
                  <span className="text-[var(--accent)]" aria-hidden="true">
                    {q.icon}
                  </span>
                  <span className="block text-[13px] font-medium leading-4">
                    {q.title}
                  </span>
                  <span className="math-input block text-[11px] leading-4 text-[var(--chrome-soft)] truncate">
                    {q.sub}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onOpenFile();
                  close();
                }}
                className="flex flex-col gap-1 rounded-xl border border-dashed border-[var(--chrome-line)] px-3 py-3 text-left cursor-pointer transition-colors duration-150 ease-out hover:border-[var(--accent-line)] active:scale-[0.97]"
              >
                <span className="text-[var(--chrome-soft)]" aria-hidden="true">
                  <IOpen />
                </span>
                <span className="block text-[13px] font-medium leading-4">
                  {t("w.openFile")}
                </span>
                <span className="math-input block text-[11px] leading-4 text-[var(--chrome-soft)]">
                  .json
                </span>
              </button>
            </div>

            <div className="welcome-chunk welcome-d2 flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-[var(--chrome-line)]">
              <button
                type="button"
                onClick={start(loadTestScenario)}
                className={ghostBtn}
              >
                <IZap /> {t("w.demo1")}
              </button>
              <button
                type="button"
                onClick={start(loadAdvancedDemo)}
                className={ghostBtn}
              >
                <IDemo /> {t("w.demo2")}
              </button>
              <button
                type="button"
                onClick={close}
                className={`${ghostBtn} ml-auto`}
              >
                <IBlank /> {t("w.blank")}
              </button>
            </div>

            <p className="welcome-chunk welcome-d2 text-[11px] text-[var(--chrome-soft)] mt-4">
              {t("w.creator")}{" "}
              <a
                className="underline underline-offset-2 hover:text-[var(--chrome-ink)]"
                href="https://github.com/Nighty3098"
              >
                Nighty3098
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
