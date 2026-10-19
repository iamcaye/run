import Image, { type StaticImageData } from "next/image";

type ShotProps = { src: StaticImageData; alt: string; eager?: boolean; className?: string };

/** A phone-sized screenshot in a minimal device bezel. */
export function PhoneFrame({ src, alt, eager, className = "" }: ShotProps) {
  return (
    <div className={`rounded-[44px] bg-foreground p-2.5 shadow-[0_30px_60px_-20px_rgb(26_23_20/0.45)] ${className}`}>
      <Image
        src={src}
        alt={alt}
        placeholder="blur"
        sizes="(min-width: 1024px) 320px, 70vw"
        fetchPriority={eager ? "high" : undefined}
        loading={eager ? "eager" : "lazy"}
        className="h-auto w-full rounded-[34px]"
      />
    </div>
  );
}

/** A desktop screenshot under a browser-ish title bar. */
export function BrowserFrame({ src, alt, className = "" }: ShotProps) {
  return (
    <div className={`overflow-hidden rounded-[22px] border border-border bg-surface shadow-[0_30px_60px_-30px_rgb(26_23_20/0.35)] ${className}`}>
      <div aria-hidden className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </div>
      <Image src={src} alt={alt} placeholder="blur" sizes="(min-width: 1280px) 1200px, 100vw" className="h-auto w-full" />
    </div>
  );
}

/** A single card cropped out of the app, shown as-is. */
export function CardShot({ src, alt, className = "" }: ShotProps) {
  return (
    <Image
      src={src}
      alt={alt}
      placeholder="blur"
      sizes="(min-width: 1024px) 380px, 100vw"
      className={`h-auto w-full rounded-[20px] shadow-[0_20px_40px_-24px_rgb(26_23_20/0.35)] ${className}`}
    />
  );
}
