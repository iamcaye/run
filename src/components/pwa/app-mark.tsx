/**
 * App mark: an athletics track (outer lane + inner lane) with an ink finish line,
 * on track red. Kept inside the central 80% so it survives maskable crops.
 * Mirrors src/app/icon.svg — update both together.
 */
export function AppMark({ size }: { size: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex" }}>
      <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#c9361a" />
        <rect x="16" y="28" width="68" height="44" rx="22" fill="none" stroke="#f4f1ea" strokeWidth="8" />
        <rect x="29" y="41" width="42" height="18" rx="9" fill="none" stroke="#f4f1ea" strokeWidth="3" opacity="0.7" />
        <path d="M50 22V34" stroke="#1a1714" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
