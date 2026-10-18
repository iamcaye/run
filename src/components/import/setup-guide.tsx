import { CopyField } from "@/components/ui/copy-field";

/** Step-by-step Health Auto Export configuration. `token` is only known right after creation. */
export function SetupGuide({ endpoint, token }: { endpoint: string; token?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <CopyField label="URL" value={endpoint} />
      <CopyField label="Header" value={`Authorization: Bearer ${token ?? "<your import token>"}`} secret={Boolean(token)} />
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          Install <strong>Health Auto Export</strong> on your iPhone and open <em>Automations</em> → <em>New automation</em>.
        </li>
        <li>
          Automation type: <strong>REST API</strong>. Paste the URL above.
        </li>
        <li>
          Add a header: key <code>Authorization</code>, value <code>Bearer {token ? "rtt_…" : "<token>"}</code>.
        </li>
        <li>
          Export format: <strong>JSON</strong>. Data type: <strong>Workouts</strong> only.
        </li>
        <li>
          Turn on <strong>Include route data</strong> and <strong>Include workout metrics</strong> (heart rate).
        </li>
        <li>
          Date range: <strong>Last 7 days</strong> — overlapping re-sends are fine, nothing gets duplicated.
        </li>
        <li>
          Turn on <strong>Batch requests</strong> so large exports (long runs with routes) stay under the size limit.
        </li>
        <li>Choose a sync interval (e.g. hourly) and enable the automation. Tap “Manual export” once to test.</li>
      </ol>
    </div>
  );
}
