export const metadata = { title: "Offline · Race Training" };

/** Served by the service worker when a page can't load without a connection. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-4xl" aria-hidden>
        ⛰️
      </p>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted">
        Your plan and runs need a connection to load. Your watch keeps recording — Health Auto Export will sync
        the runs once you&apos;re back online.
      </p>
      <a href="/dashboard" className="rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-foreground">
        Try again
      </a>
    </main>
  );
}
