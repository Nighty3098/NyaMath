export type PrintMode = 'color' | 'bw';

/**
 * Печать / PDF-экспорт в двух режимах:
 * - color: цвета текущей темы (как на экране)
 * - bw: ч/б версия (чёрный текст, белый фон, графики в grayscale)
 *
 * Режим передаётся в CSS через `documentElement[data-print]`.
 * `@page { margin: 0 }` убирает белые поля и штатные колонтитулы
 * браузера (URL, дата, номера страниц живут в полях страницы).
 */
export function printDocument(mode: PrintMode = 'color'): void {
  try {
    document.documentElement.dataset.print = mode;
  } catch { /* ignore */ }
  // Даём браузеру кадр на применение data-print перед открытием диалога печати
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

/** Сброс режима печати после закрытия диалога (beforeprint/afterprint). */
export function installPrintCleanup(): () => void {
  const commit = () => {
    // Коммитим открытый редактор, иначе печатается пустой textarea
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Ctrl+P / системная печать в обход меню: по умолчанию — цвет текущей темы
    try {
      if (!document.documentElement.dataset.print) {
        document.documentElement.dataset.print = 'color';
      }
    } catch { /* ignore */ }
  };
  const cleanup = () => {
    try {
      delete document.documentElement.dataset.print;
    } catch { /* ignore */ }
  };
  window.addEventListener('beforeprint', commit);
  window.addEventListener('afterprint', cleanup);
  return () => {
    window.removeEventListener('beforeprint', commit);
    window.removeEventListener('afterprint', cleanup);
  };
}
