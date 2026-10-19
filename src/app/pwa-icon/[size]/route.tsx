import { ImageResponse } from "next/og";
import { AppMark } from "@/components/pwa/app-mark";

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

/** PNG app icons for the manifest, drawn at build time (no binary assets in the repo). */
export async function GET(_req: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.includes(size as (typeof SIZES)[number])) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppMark size={size} />, { width: size, height: size });
}
