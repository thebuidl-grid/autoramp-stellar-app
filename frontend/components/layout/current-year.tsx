"use client";

import { useEffect, useState } from "react";

// Renders the current year. The server/build-time value is used for the first
// paint, then corrected on the client so a long-lived static build never goes stale.
export function CurrentYear() {
  const [year, setYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return <span suppressHydrationWarning>{year}</span>;
}
