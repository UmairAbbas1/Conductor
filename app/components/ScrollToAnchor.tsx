"use client";

import { useEffect } from "react";

/** Scroll a container so the anchor (e.g. the buyer's booking) sits near the top: the story starts there. */
export function ScrollToAnchor({ container, anchor }: { container: string; anchor: string }) {
  useEffect(() => {
    const box = document.getElementById(container);
    const el = document.getElementById(anchor);
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - box.offsetTop - 180), behavior: "instant" });
  }, [container, anchor]);
  return null;
}
