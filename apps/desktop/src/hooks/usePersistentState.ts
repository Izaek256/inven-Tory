import { useState, useEffect, useCallback } from 'react';

function _safeRead(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function _safeWrite(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private-mode errors
  }
}

function _safeRemove(key: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

type Updater<T> = T | ((prev: T) => T);

function _resolveUpdater<T>(current: T, updater: Updater<T>): T {
  if (typeof updater === 'function') {
    return (updater as (prev: T) => T)(current);
  }
  return updater;
}

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, (updater: Updater<T>) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = _safeRead(key);
    if (raw === null) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    const handler = (e: StorageEvent): void => {
      if (e.key === key) {
        if (e.newValue === null) {
          setValue(defaultValue);
        } else {
          try {
            setValue(JSON.parse(e.newValue) as T);
          } catch {
            setValue(defaultValue);
          }
        }
      }
    };
    window.addEventListener('storage', handler);
    return (): void => window.removeEventListener('storage', handler);
  }, [key, defaultValue]);

  const setPersisted = useCallback(
    (updater: Updater<T>) => {
      setValue((prev) => {
        const next = _resolveUpdater(prev, updater);
        _safeWrite(key, JSON.stringify(next));
        return next;
      });
    },
    [key],
  );

  const reset = useCallback(() => {
    setValue(defaultValue);
    _safeRemove(key);
  }, [key, defaultValue]);

  return [value, setPersisted, reset];
}
