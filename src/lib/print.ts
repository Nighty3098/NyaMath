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
import { useCanvasStore } from '../store/canvasStore';
import { getLang, t } from '../i18n';

/** Заполнить шапку печатного отчёта (название + дата + счётчики). */
export function fillPrintHead(): void {
  try {
    const el = document.getElementById('nya-print-head');
    if (!el) return;
    const st = useCanvasStore.getState();
    const blocks = Object.values(st.blocks);
    const errs = blocks.filter((b) => b.error).length;
    const date = new Date().toLocaleDateString(getLang() === 'ru' ? 'ru-RU' : 'en-US');
    const title = el.querySelector('[data-ph="title"]');
    const sub = el.querySelector('[data-ph="sub"]');
    if (title) title.textContent = t('print.head', { date });
    if (sub) sub.textContent = t('print.sub', { n: blocks.length, e: errs });
  } catch {
    /* ignore */
  }
}

export function printDocument(mode: PrintMode = 'color'): void {
  try {
    document.documentElement.dataset.print = mode;
  } catch {
    /* ignore */
  }
  // Гасим виртуализацию ЗАРАНЕЕ: полный рендер успевает закоммититься
  // за два кадра (иначе в печать попадут только видимые блоки).
  try {
    useCanvasStore.getState().setPrinting(true);
  } catch {
    /* стор недоступен — печать как есть */
  }
  // Даём браузеру кадры на применение data-print и полный рендер
  // перед открытием диалога печати
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

/** Сброс режима печати после закрытия диалога (beforeprint/afterprint). */
export function installPrintCleanup(): () => void {
  const cleanupPrint = () => {
    try {
      delete document.documentElement.dataset.print;
    } catch {
      /* ignore */
    }
    try {
      useCanvasStore.getState().setPrinting(false);
    } catch {
      /* ignore */
    }
  };
  const commit = () => {
    // Коммитим открытый редактор, иначе печатается пустой textarea
    (document.activeElement as HTMLElement | null)?.blur?.();
    fillPrintHead();
    // Ctrl+P / системная печать в обход меню: по умолчанию — цвет текущей темы
    try {
      if (!document.documentElement.dataset.print) {
        document.documentElement.dataset.print = 'color';
      }
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('beforeprint', commit);
  window.addEventListener('afterprint', cleanupPrint);
  return () => {
    window.removeEventListener('beforeprint', commit);
    window.removeEventListener('afterprint', cleanupPrint);
  };
}
