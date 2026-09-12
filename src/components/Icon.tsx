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
export const IProgram = () => (
  <Svg>
    <path d="M5.5 4 2.5 8l3 4M10.5 4l3 4-3 4" />
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
