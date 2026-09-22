/**
 * Навигация по листу из глобальных элементов (Ctrl+K-навигатор).
 * Canvas регистрирует обработчик центрирования; остальной код вызывает focusBlock.
 */

export type BlockFocusFn = (id: string) => void;

let handler: BlockFocusFn | null = null;

/** Зарегистрировать обработчик центрирования на холст. Возвращает очистку. */
export function registerBlockFocus(fn: BlockFocusFn): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

/** Центрировать лист на блоке (no-op, если холст ещё не зарегистрирован). */
export function focusBlock(id: string): void {
  handler?.(id);
}
