"use client";

import { useEffect } from "react";
import { authClient } from "./auth-client";

// Half the server's session cookieCache maxAge (10 min), so the cached cookie rarely lapses mid-session.
const REFRESH_MS = 5 * 60_000;

/**
 * Keeps better-auth's session cookie cache warm. Server Components can't write cookies, so without this the
 * cache expires and every page render goes back to querying the session table.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < REFRESH_MS) return;
      last = Date.now();
      // Bypass the cache so the server re-reads the session and re-issues a fresh cookie.
      void authClient.getSession({ query: { disableCookieCache: true } });
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return null;
}
