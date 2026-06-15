"use client";

import { TopLoader as NextTopLoader } from "next-top-loader";

/**
 * TopLoader Component
 * 
 * Displays a progress bar at the top of the page during navigation
 * Uses next-top-loader library for smooth navigation feedback
 */
export function TopLoader() {
  return (
    <NextTopLoader
      color="#00F9C7"
      height={3}
      zIndex={1600}
    />
  );
}

