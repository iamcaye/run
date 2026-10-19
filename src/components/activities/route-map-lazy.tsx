"use client";

import dynamic from "next/dynamic";
import type { LatLon } from "./route-map";

const RouteMap = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-border/40 lg:h-96" />,
});

export function RouteMapLazy({ points }: { points: readonly LatLon[] }) {
  return (
    <figure className="flex flex-col gap-1">
      <RouteMap points={points} />
      <figcaption className="text-xs text-muted">
        <span aria-hidden className="text-status-good">●</span> start · <span aria-hidden className="text-status-critical">●</span> finish
      </figcaption>
    </figure>
  );
}
