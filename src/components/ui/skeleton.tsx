import type { ReactNode } from "react";
import { NarrowPage } from "./narrow-page";

/** A placeholder block; size it with className. */
export function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`rounded-xl bg-track motion-safe:animate-pulse ${className}`} />;
}

/** Card-shaped placeholder with a few text lines. */
export function CardSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex flex-col gap-3 rounded-[20px] bg-surface p-4 ${className}`}>
      <Bone className="h-5 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} className={`h-4 ${i % 2 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/**
 * Route loading UI (`loading.tsx`): shown the moment a link is tapped while the server renders the page.
 * The title is real text when the route knows it, so the screen reads as "arrived" straight away.
 */
export function PageSkeleton({
  title,
  action,
  narrow,
  children,
}: {
  title?: string;
  action?: boolean;
  narrow?: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        {title ? (
          <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">{title}</h1>
        ) : (
          <Bone className="h-[30px] w-48" />
        )}
        {action ? <Bone className="h-9 w-24" /> : null}
      </div>
      {children}
    </>
  );
  return (
    <div role="status" aria-busy aria-label="Loading">
      {narrow ? <NarrowPage>{body}</NarrowPage> : <div className="flex flex-col gap-4">{body}</div>}
    </div>
  );
}
