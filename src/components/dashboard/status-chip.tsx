import type { SessionStatus } from "@/lib/metrics";

// Status colour always comes with an icon and a word.
const STYLES: Record<SessionStatus, { icon: string; label: string; className: string }> = {
  done: { icon: "✓", label: "Done", className: "text-status-good" },
  missed: { icon: "✕", label: "Missed", className: "text-status-critical" },
  today: { icon: "●", label: "Today", className: "text-accent" },
  upcoming: { icon: "○", label: "Upcoming", className: "text-muted" },
  rest: { icon: "–", label: "Rest", className: "text-muted" },
};

export function StatusChip({ status }: { status: SessionStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.className}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}
