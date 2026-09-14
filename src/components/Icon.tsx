import type { SVGProps } from 'react';

/**
 * Единый набор иконок: stroke 1.5px, round caps — один визуальный язык везде.
 * Декоративные (grip/resize) — aria-hidden, смысловые кнопки получают aria-label снаружи.
 */
function Svg({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  );
}

export const IPlus = () => (
  <Svg>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const IFormula = () => (
  <Svg>
    <path d="M6.5 2.5c-2 1.8-2 9.2 0 11M9.5 2.5c2 1.8 2 9.2 0 11" />
    <path d="M5 8h6" />
  </Svg>
);
export const IPlot = () => (
  <Svg>
    <path d="M2 2v11.5h12" />
    <path d="M3.5 10.5c2 0 2-4.5 4-4.5s2 3 4 3 1.5-2.5 3-2.5" />
  </Svg>
);
export const IPlot3d = () => (
  <Svg>
    <path d="M8 1.8 13.5 4.8v6.4L8 14.2 2.5 11.2V4.8L8 1.8Z" />
    <path d="M2.5 4.8 8 7.8l5.5-3M8 7.8v6.4" />
  </Svg>
);
export const IBlank = () => (
  <Svg>
    <rect x="3.5" y="2" width="9" height="12" rx="1.5" />
  </Svg>
);
export const IProgram = () => (
  <Svg>
    <path d="M5.5 4 2.5 8l3 4M10.5 4l3 4-3 4" />
  </Svg>
);
export const ISim = () => (
  <Svg>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.8 5.5v5l4-2.5-4-2.5Z" />
  </Svg>
);
export const IFx = () => (
  <Svg>
    <path d="M9.5 2 4 8.5h4L6.5 14 12 7.5H8L9.5 2Z" />
  </Svg>
);
export const IRecalc = () => (
  <Svg>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.8v2.7h-2.7" />
  </Svg>
);
export const IUndo = () => (
  <Svg>
    <path d="M6.5 3.5 3 7l3.5 3.5" />
    <path d="M3.5 7H10a3.5 3.5 0 0 1 0 7H7" />
  </Svg>
);
export const IRedo = () => (
  <Svg>
    <path d="M9.5 3.5 13 7l-3.5 3.5" />
    <path d="M12.5 7H6a3.5 3.5 0 0 0 0 7h3" />
  </Svg>
);
export const IGrid = () => (
  <Svg>
    <path d="M2.5 2.5h11v11h-11zM2.5 6h11M2.5 10h11M6 2.5v11M10 2.5v11" />
  </Svg>
);
export const IZap = () => (
  <Svg>
    <path d="M8.8 1.8 3 9h3.5L6.8 14.2 13 6.5H9.5L8.8 1.8Z" />
  </Svg>
);
export const IDemo = () => (
  <Svg>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M2 6h12M6 6v7.5" />
  </Svg>
);
export const ISave = () => (
  <Svg>
    <path d="M8 2v7M5.5 6.5 8 9l2.5-2.5" />
    <path d="M2.5 10.5V13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2.5" />
  </Svg>
);
export const IOpen = () => (
  <Svg>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4A1.5 1.5 0 0 1 13.5 6.5v5A1.5 1.5 0 0 1 12 13h-8.5A1.5 1.5 0 0 1 2 11.5v-7Z" />
  </Svg>
);
export const IX = () => (
  <Svg>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);
export const ISun = () => (
  <Svg>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1" />
  </Svg>
);
export const IMoon = () => (
  <Svg>
    <path d="M13 10.5A5 5 0 0 1 5.5 3 5 5 0 1 0 13 10.5Z" />
  </Svg>
);
export const IGrip = () => (
  <Svg>
    <circle cx="6" cy="4" r="0.6" fill="currentColor" />
    <circle cx="10" cy="4" r="0.6" fill="currentColor" />
    <circle cx="6" cy="8" r="0.6" fill="currentColor" />
    <circle cx="10" cy="8" r="0.6" fill="currentColor" />
    <circle cx="6" cy="12" r="0.6" fill="currentColor" />
    <circle cx="10" cy="12" r="0.6" fill="currentColor" />
  </Svg>
);
export const IResize = () => (
  <Svg>
    <path d="M13.5 9.5v4h-4M13.5 13.5 9 9" />
  </Svg>
);
/** Статистика: столбчатая диаграмма */
export const IChart = () => (
  <Svg>
    <path d="M2 2v11.5h12" />
    <path d="M5.5 11V8M8.5 11V5M11.5 11V6.5" />
  </Svg>
);
/** Исчисление: знак интеграла */
export const ICalc = () => (
  <Svg>
    <path d="M10 2.5H8.5C6.5 5 7 8 5.5 10.5c-.8 1.4-.5 3 1 3H8" />
  </Svg>
);
/** Единицы: линейка */
export const IUnits = () => (
  <Svg>
    <rect x="2" y="5.5" width="12" height="5" rx="1" />
    <path d="M5.5 5.5V8M8.5 5.5v3.5M11.5 5.5V8" />
  </Svg>
);
/** Телеком: радиоволны */
export const ISignal = () => (
  <Svg>
    <circle cx="8" cy="11" r="0.8" fill="currentColor" />
    <path d="M5.2 8.5a4 4 0 0 1 5.6 0M3 6.2a7.2 7.2 0 0 1 10 0" />
  </Svg>
);
/** Контурный график: изолинии */
export const IContour = () => (
  <Svg>
    <path d="M8 2.5c3.2 0 5.5 2.4 5.5 5.5s-2.3 5.5-5.5 5.5S2.5 11.1 2.5 8 4.8 2.5 8 2.5Z" />
    <path d="M8 5.8c1.3 0 2.2.9 2.2 2.2S9.3 10.2 8 10.2s-2.2-.9-2.2-2.2S6.7 5.8 8 5.8Z" />
  </Svg>
);
/** Пристыковать влево */
export const IDockLeft = () => (
  <Svg>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M6 2.5v11" />
  </Svg>
);
/** Пристыковать вправо */
export const IDockRight = () => (
  <Svg>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M10 2.5v11" />
  </Svg>
);
/** Открепить (плавающее окно) */
export const IUndock = () => (
  <Svg>
    <path d="M9.5 2.5H12A1.5 1.5 0 0 1 13.5 4v2.5" />
    <rect x="2.5" y="5.5" width="10" height="8" rx="1.5" />
  </Svg>
);
/** Копировать (буфер обмена) */
export const ICopy = () => (
  <Svg>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Svg>
);
/** Таблица (CSV-данные) */
export const ITable = () => (
  <Svg>
    <rect x="2.5" y="3" width="11" height="10" rx="1" />
    <path d="M2.5 6.5h11M2.5 9.8h11M7 3v10" />
  </Svg>
);
/** Принтер (печать / PDF) */
export const IPrint = () => (
  <Svg>
    <path d="M5 6V2.5h6V6" />
    <rect x="2.5" y="6" width="11" height="5.5" rx="1.5" />
    <rect x="5" y="9.5" width="6" height="4" />
  </Svg>
);
