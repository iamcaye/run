import { ImageResponse } from "next/og";

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

/** PNG app icons for the manifest, drawn at build time (no binary assets in the repo). */
export async function GET(_req: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.includes(size as (typeof SIZES)[number])) return new Response("Not found", { status: 404 });
  return new ImageResponse(<Mark size={size} />, { width: size, height: size });
}

/** Maskable-safe: the glyph stays inside the central 80%. */
function Mark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#c9361a",
        color: "#ffffff",
        fontSize: size * 0.42,
        fontWeight: 700,
        letterSpacing: -size * 0.02,
      }}
    >
      RT
    </div>
  );
}
