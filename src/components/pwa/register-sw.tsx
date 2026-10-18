"use client";

import { useEffect } from "react";

/** Registers the service worker in production builds only (dev reloads would fight the cache). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err: unknown) => {
      console.warn("Service worker registration failed", err);
    });
  }, []);
  return null;
}
