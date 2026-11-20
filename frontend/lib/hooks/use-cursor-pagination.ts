"use client";

import { useCallback, useState } from "react";

/**
 * Tracks a stack of cursors so keyset-paginated lists can step both
 * forward (via the server's nextCursor) and backward (by popping the stack),
 * since cursor pagination has no notion of jumping to an arbitrary page.
 */
export function useCursorPagination() {
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [index, setIndex] = useState(0);

  const cursor = cursorStack[index];

  const goNext = useCallback(
    (nextCursor: string) => {
      setCursorStack((stack) => (index + 1 < stack.length ? stack : [...stack, nextCursor]));
      setIndex((i) => i + 1);
    },
    [index],
  );

  const goPrevious = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const reset = useCallback(() => {
    setCursorStack([undefined]);
    setIndex(0);
  }, []);

  return {
    cursor,
    pageNumber: index + 1,
    canGoPrevious: index > 0,
    goNext,
    goPrevious,
    reset,
  };
}
