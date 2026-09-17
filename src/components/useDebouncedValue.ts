import { useEffect, useRef, useState } from 'react';

export interface Debounced<T> {
  /** значение c задержкой delayMs после последнего изменения */
  value: T;
  /** true, пока вход меняется чаще, чем delayMs (идёт жест/печать) */
  live: boolean;
}

/**
 * Дебаунс тяжёлых пересчётов (#8): ресемплинг 3D/контуров.
 * Первый рендер — сразу (без задержки), дальше snap отстаёт от входа на
 * delayMs. Пока вход «живой», вызывающий код рисует дешёвое превью
 * (половинное разрешение), по окончании — полный кадр.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): Debounced<T> {
  const [snap, setSnap] = useState(value);
  const [live, setLive] = useState(false);
  const snapRef = useRef(snap);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  useEffect(() => {
    if (Object.is(snapRef.current, value)) return;
    setLive(true);
    if (timer.current) clearTimeout(timer.current);
    const v = value;
    timer.current = setTimeout(() => {
      timer.current = null;
      setSnap(v);
      setLive(false);
    }, delayMs);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [value, delayMs]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { value: snap, live };
}
