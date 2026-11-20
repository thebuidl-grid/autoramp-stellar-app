"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "persisted-flag-change";

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback; // storage blocked (private mode, site data cleared): behave as if nothing was saved
  }
}

/**
 * A boolean that survives reloads (localStorage) without a flash or a hydration mismatch: the server and the first client render
 * use `fallback`, then the saved value takes over. Other tabs and other components using the same key stay in sync.
 */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const subscribe = useCallback(
    (notify: () => void) => {
      const onStorage = (e: StorageEvent) => (e.key === null || e.key === key) && notify();
      window.addEventListener("storage", onStorage);
      window.addEventListener(EVENT, notify);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(EVENT, notify);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(read(key, fallback)) : next;
      try {
        localStorage.setItem(key, String(resolved));
      } catch {
        // can't persist; still tell listeners so this visit updates
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key, fallback],
  );
  return [value, set];
}
