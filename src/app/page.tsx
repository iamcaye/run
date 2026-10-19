import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BrowserFrame, CardShot, PhoneFrame } from "@/components/landing/frames";
import { Wordmark } from "@/components/ui/wordmark";
import { getCurrentUser } from "@/server/auth/session";
// Real screenshots of the seeded demo runners — regenerate with `pnpm screenshots`.
import cardHr from "@/assets/landing/card-hr.png";
import cardRoute from "@/assets/landing/card-route.png";
import cardSession from "@/assets/landing/card-session.png";
import cardSplits from "@/assets/landing/card-splits.png";
import cardZones from "@/assets/landing/card-zones.png";
import desktopDashboard from "@/assets/landing/desktop-dashboard.png";
import desktopPlan from "@/assets/landing/desktop-plan.png";
import phoneDashboard from "@/assets/landing/phone-dashboard.png";
import phoneLog from "@/assets/landing/phone-log.png";
import phonePlan from "@/assets/landing/phone-plan.png";

export const metadata: Metadata = {
  title: "Race Training — a plan for your next race",
  description:
    "Pick a race, get a week-by-week plan that fits the days you can run, and sync your runs from Apple Watch.",
};

const PLAN_RULES = [
  ["≤ 10%", "weekly volume increase, with a lighter week every fourth"],
  ["0", "hard days back to back, or next to the long run"],
  ["Riegel", "paces derived from your target time — or effort (RPE) if you just want to finish"],
  ["Yours", "move or edit any session; regenerating the future keeps your changes"],
] as const;

const CHECK_IN = [
  ["Back after a break", "More than a week without running steps the plan back instead of picking up where it was."],
  ["Load spike", "Last 7 days well above your 4-week average? Next week gets lighter and loses a hard session."],
  ["Missed weeks", "Two weeks under 70% of the plan repeat the load rather than piling on more."],
  ["Too easy", "Quality runs consistently faster than target suggest reviewing the goal — never changed for you."],
] as const;

function Section({ id, n, title, lead, children }: { id: string; n: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto flex w-full max-w-6xl scroll-mt-8 flex-col gap-10 px-4 py-16 sm:py-24">
      <header className="flex max-w-2xl flex-col gap-3">
        <span className="font-condensed text-sm font-bold tracking-[0.2em] text-accent uppercase">{n}</span>
        <h2 className="font-condensed text-4xl leading-[0.95] font-extrabold uppercase sm:text-5xl">{title}</h2>
        <p className="text-lg text-muted">{lead}</p>
      </header>
      {children}
    </section>
  );
}

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-5">
        <Wordmark className="text-[22px]" />
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link href="/sign-in" className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-lg bg-accent px-3 py-2 text-accent-foreground">
            Create account
          </Link>
        </nav>
      </header>

      <main className="flex flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-8 sm:pt-20 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-6">
            <span className="font-condensed text-sm font-bold tracking-[0.2em] text-accent uppercase">
              5K · 10K · Half · Marathon
            </span>
            <h1 className="font-condensed text-6xl leading-[0.88] font-extrabold uppercase italic sm:text-8xl">
              Pick a race.
              <br />
              Get the plan.
              <br />
              <span className="text-accent">Run it.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted sm:text-xl">
              Set a goal and a date, tell it which days you can run, and get a week-by-week plan from base to taper.
              Runs sync from your Apple Watch and land on the day&apos;s session; each week the plan checks how it went.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#tour" className="rounded-xl bg-foreground px-5 py-3 font-semibold text-background">
                Take the tour ↓
              </a>
              <Link href="/sign-up" className="rounded-xl border border-border bg-surface px-5 py-3 font-semibold">
                Create account
              </Link>
            </div>
            <p className="text-sm text-muted">Every screenshot on this page is the real app, signed in as a demo runner.</p>
          </div>
          <PhoneFrame
            src={phoneDashboard}
            alt="Dashboard on a phone: 90 days to a 10K, predicted 1:07:59, the plan drawn as an elevation profile, today's session and this week's stats"
            eager
            className="mx-auto w-[min(300px,80vw)] rotate-2 lg:w-full"
          />
        </section>

        {/* Dashboard */}
        <Section
          id="tour"
          n="01 · Dashboard"
          title="Race day, from today"
          lead="The countdown, where you are in the plan, today's session and whether your load is on track. The plan's weekly volume is drawn as a course profile — you're the dot."
        >
          <BrowserFrame
            src={desktopDashboard}
            alt="Desktop dashboard with the race hero, this week's sessions, planned vs run volume, training load ratio with its risk band, and long-run progression"
          />
          <dl className="grid gap-6 sm:grid-cols-3">
            {[
              ["Predicted vs target", "Estimated from your recent runs and compared against your goal time."],
              ["Training load ratio", "Last 7 days against your 4-week average, with the safe band marked."],
              ["Planned vs run", "Weekly volume bars and long-run progression, with the data one tap away."],
            ].map(([t, d]) => (
              <div key={t} className="flex flex-col gap-1 border-t-2 border-foreground pt-3">
                <dt className="font-condensed text-xl font-extrabold uppercase">{t}</dt>
                <dd className="text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Plan */}
        <div className="bg-surface">
          <Section
            id="plan"
            n="02 · Plan"
            title="Base, build, race-specific, taper"
            lead="The plan is generated by plain rules, not AI: the same goal and availability always give the same plan, and you can see why every week looks the way it does."
          >
            <div className="grid items-start gap-10 lg:grid-cols-[320px_1fr]">
              <PhoneFrame
                src={phonePlan}
                alt="Plan on a phone: 21 weekly volume bars coloured by phase, peaking at 48 km a week before the taper"
                className="mx-auto w-[min(300px,80vw)] lg:w-full"
              />
              <div className="flex flex-col gap-8">
                <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  {PLAN_RULES.map(([big, text]) => (
                    <li key={big} className="flex flex-col gap-1">
                      <span className="font-condensed text-5xl font-extrabold text-accent italic">{big}</span>
                      <span className="text-muted">{text}</span>
                    </li>
                  ))}
                </ul>
                <figure className="flex max-w-md flex-col gap-3">
                  <CardShot
                    src={cardSession}
                    alt="A tempo session opened up: 8.5 km at a 4:49 /km target, split into warm-up, 5 km at pace and cool-down"
                    className="ring-1 ring-border"
                  />
                  <figcaption className="text-sm text-muted">
                    Quality sessions come with their structure: warm-up, main set at target pace, cool-down.
                  </figcaption>
                </figure>
              </div>
            </div>
            <figure className="flex flex-col gap-3">
              <BrowserFrame
                src={desktopPlan}
                alt="Plan as a month calendar on desktop, with done and missed sessions marked and weekly totals in the last column"
              />
              <figcaption className="text-sm text-muted">
                On a bigger screen the plan becomes a calendar: done ✓ and missed ! at a glance, weekly totals on the right.
              </figcaption>
            </figure>
          </Section>
        </div>

        {/* Runs */}
        <Section
          id="runs"
          n="03 · Runs"
          title="From your watch, no Strava"
          lead={
            <>
              Runs arrive from Apple Watch through the iOS app <strong className="text-foreground">Health Auto Export</strong>, with
              route and heart rate, and are matched to that day&apos;s planned session. Re-sends are harmless — nothing gets
              counted twice.
            </>
          }
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <CardShot src={cardRoute} alt="Route card: an OpenStreetMap map with the run's loop, start and finish" />
            <CardShot src={cardSplits} alt="Splits card: pace for every kilometre, fastest ones highlighted" />
            <div className="flex flex-col gap-5 sm:col-span-2 lg:col-span-1">
              <CardShot src={cardHr} alt="Heart-rate chart over the run with zone thresholds" />
              <CardShot src={cardZones} alt="Time in heart-rate zones: mostly zone 2 for an easy run" />
            </div>
          </div>
        </Section>

        {/* Check-in + quick log */}
        <div className="bg-hero text-hero-foreground">
          <section id="check-in" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:py-24">
            <header className="flex max-w-2xl flex-col gap-3">
              <span className="font-condensed text-sm font-bold tracking-[0.2em] uppercase opacity-80">04 · Weekly check-in</span>
              <h2 className="font-condensed text-4xl leading-[0.95] font-extrabold uppercase sm:text-5xl">
                The plan notices when life happens
              </h2>
              <p className="text-lg opacity-85">
                When a week closes, the plan looks at what you actually ran. If something needs to change, you get a proposal
                with the reason in plain words — accept it or keep the plan as it was.
              </p>
            </header>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CHECK_IN.map(([t, d]) => (
                <li key={t} className="flex flex-col gap-2 rounded-[22px] bg-white/10 p-5">
                  <span className="font-condensed text-2xl font-extrabold uppercase">{t}</span>
                  <span className="opacity-85">{d}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <Section
          id="log"
          n="05 · Quick log"
          title="How did it feel?"
          lead="Rate your latest run in two taps, or log one the watch missed. Install it to your home screen and Log is the big red button in the middle."
        >
          <div className="grid items-center gap-10 lg:grid-cols-[320px_1fr]">
            <PhoneFrame
              src={phoneLog}
              alt="Quick log on a phone: the latest run with an effort scale from 1 to 10 and a notes field"
              className="mx-auto w-[min(300px,80vw)] -rotate-2 lg:w-full"
            />
            <div className="flex flex-col gap-6">
              <p className="max-w-lg text-lg text-muted">
                Effort ratings feed the training-load numbers, so the check-in gets more accurate the more you log. No heart-rate
                strap? Plans for &ldquo;just finish&rdquo; goals are written in effort instead of paces.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/sign-up" className="rounded-xl bg-accent px-5 py-3 font-semibold text-accent-foreground">
                  Create account
                </Link>
                <Link href="/sign-in" className="rounded-xl border border-border bg-surface px-5 py-3 font-semibold">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-muted">
          <Wordmark className="text-lg text-foreground" />
          <span>Next.js · Postgres · Drizzle · Better Auth · Tailwind</span>
        </div>
      </footer>
    </div>
  );
}
