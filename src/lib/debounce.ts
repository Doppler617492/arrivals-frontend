import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that updates after `delayMs` of inactivity.
 * Useful for text inputs that trigger filtering/search.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), Math.max(0, delayMs));
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Debounces a function; subsequent calls within the delay reset the timer.
 */
export function debounce<F extends (...args: any[]) => void>(fn: F, wait = 300) {
  let t: any;
  return (...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

