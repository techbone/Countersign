import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Fingerprint,
  Gauge,
  Power,
  ShieldCheck,
  Terminal,
} from "lucide-react";

export default function Landing() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-ink">
      <Nav />
      <Hero />
      <Enforcement />
      <Showcase />
      <Loop />
      <Footer />
    </main>
  );
}

/* ---------------------------------------------------------------- nav ---- */

function Nav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-edge/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-4 md:px-12">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-acid" strokeWidth={2.4} />
          <span className="font-display text-sm font-bold tracking-tight">
            SENTINEL
          </span>
        </div>
        <span className="util hidden text-dim md:block">
          Risk control plane
        </span>
        <Link
          href="/dashboard"
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-acid px-5 py-2 text-xs font-semibold text-ink transition hover:bg-acid/85"
        >
          Open control plane
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------- hero ---- */

function Hero() {
  return (
    <section className="relative flex min-h-screen items-center border-b border-edge">
      {/* Reserved mount point for the WebGL / canvas replay. */}
      <div
        id="hero-canvas-mount"
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <div className="dot-grid grid-fade absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-tr from-ink via-transparent to-ink/80" />
        {/* Single sweeping line — the only motion in the hero. */}
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden opacity-40">
          <div className="scan-line h-px w-full bg-gradient-to-r from-transparent via-acid to-transparent" />
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[1600px] px-6 pt-32 pb-24 md:px-12">
        <div className="grid grid-cols-12 gap-y-16">
          {/* Asymmetric: type block sits left, deliberately short of centre. */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-7">
            <div className="flex items-center gap-3">
              <span className="size-1.5 rounded-full bg-acid pulse-dot" />
              <span className="util text-dim">
                Binance Agent OS · Track A
              </span>
            </div>

            <h1 className="font-display mt-10 text-[13vw] leading-[0.85] font-bold tracking-[-0.045em] sm:text-7xl md:text-8xl xl:text-[7.5rem]">
              Agents trade.
              <br />
              <span className="text-dim">Sentinel</span>{" "}
              <span className="text-acid">decides.</span>
            </h1>

            <p className="mt-12 max-w-lg text-base leading-relaxed text-muted">
              Binance shipped the execution rails and left the guardrails to
              you. Sentinel is the layer in between — every order an agent wants
              to place clears{" "}
              <span className="text-fg">fifteen deterministic rules</span>{" "}
              first, and every fill is signed, single-use and reconciled after.
            </p>

            <div className="mt-14 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-3 rounded-full bg-acid px-8 py-4 text-sm font-semibold text-ink transition hover:bg-acid/85"
              >
                Open control plane
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="https://github.com"
                className="inline-flex items-center gap-2.5 rounded-full border border-edge-bright px-7 py-4 text-sm font-medium text-muted transition hover:border-dim hover:text-fg"
              >
                <Terminal className="size-4" />
                Read the agent contract
              </a>
            </div>
          </div>

          {/* Stat rail — pushed right, hangs off the type block. */}
          <div className="col-span-12 lg:col-span-4 lg:col-start-9 lg:self-end xl:col-span-3 xl:col-start-10">
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-edge bg-edge lg:grid-cols-1">
              <Stat value="15" label="Policy rules" />
              <Stat value="0" label="Withdrawal scopes" />
              <Stat value="100%" label="Attestation target" accent />
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-ink px-5 py-6">
      <dd
        className={`font-display tnum text-4xl font-bold tracking-tight ${
          accent ? "text-acid" : "text-fg"
        }`}
      >
        {value}
      </dd>
      <dt className="util mt-2 text-dim">{label}</dt>
    </div>
  );
}

/* -------------------------------------------------------- enforcement ---- */

function Enforcement() {
  return (
    <section className="border-b border-edge px-6 py-40 md:px-12 md:py-56">
      <div className="mx-auto max-w-[1600px]">
        <div className="grid grid-cols-12 gap-y-20">
          <div className="col-span-12 lg:col-span-7">
            <span className="util text-dim">01 — Enforcement</span>
            <h2 className="font-display mt-8 text-5xl leading-[0.9] font-bold tracking-[-0.04em] md:text-7xl xl:text-8xl">
              Every intent
              <br />
              stops here
              <br />
              <span className="text-acid">first.</span>
            </h2>
          </div>

          <div className="col-span-12 space-y-10 lg:col-span-4 lg:col-start-9 lg:pt-8">
            <p className="text-lg leading-relaxed text-muted">
              An agent cannot reach Binance without a token, and a token is only
              minted when the policy engine says so.
            </p>
            <p className="text-sm leading-relaxed text-dim">
              The engine is a pure function of intent, policy, risk state and
              live market data. No model sits in the decision path, so the same
              inputs always produce the same verdict — and the verdict is
              legible to a human, not a confidence score.
            </p>

            <div className="space-y-px overflow-hidden rounded-xl border border-edge bg-edge">
              <Verdict
                decision="ALLOW"
                detail="Cleared all 15 checks at $8.00 notional."
              />
              <Verdict
                decision="BLOCK"
                detail="Per-trade notional, daily budget, concentration."
              />
              <Verdict
                decision="APPROVAL"
                detail="$18.00 is above the human sign-off threshold."
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Verdict({
  decision,
  detail,
}: {
  decision: "ALLOW" | "BLOCK" | "APPROVAL";
  detail: string;
}) {
  const tone =
    decision === "ALLOW"
      ? "text-acid"
      : decision === "BLOCK"
        ? "text-bad"
        : "text-warn";
  return (
    <div className="flex items-start gap-4 bg-ink px-5 py-4">
      <span className={`font-display text-[11px] font-bold tracking-wider ${tone} w-16 shrink-0`}>
        {decision}
      </span>
      <span className="text-xs leading-relaxed text-muted">{detail}</span>
    </div>
  );
}

/* ----------------------------------------------------------- showcase ---- */

const FEATURES = [
  {
    icon: Fingerprint,
    kicker: "Attestation",
    title: "Single-use HMAC execution tokens",
    body: "An ALLOW verdict mints one signed token, bound to that exact order and expiring in five minutes. Forged signatures, expired tokens and replays are all refused. Reconciliation then diffs exchange history against the ledger — any order that reached Binance without a token is permanently marked UNATTESTED.",
    footnote: "Non-compliance becomes provable, not deniable.",
  },
  {
    icon: Gauge,
    kicker: "Policy engine",
    title: "Fifteen deterministic rules",
    body: "Notional caps, daily turnover budget, leverage ceiling, realised-loss stop, drawdown breaker, cooldown, trade-rate limiter, position count, concentration, and a volatility guard fed by live one-minute klines. Nothing short-circuits — every rule reports, so you see what passed as well as what failed.",
    footnote: "Same inputs, same verdict, every time.",
  },
];

function Showcase() {
  return (
    <section className="border-b border-edge px-6 py-40 md:px-12 md:py-56">
      <div className="mx-auto max-w-[1600px]">
        <span className="util text-dim">02 — Technical</span>

        <div className="mt-20 grid grid-cols-12 gap-x-8 gap-y-24">
          {FEATURES.map((f, i) => (
            <article
              key={f.title}
              className={`col-span-12 md:col-span-6 ${i === 1 ? "lg:col-span-5 lg:col-start-8" : "lg:col-span-5"}`}
            >
              <f.icon className="size-6 text-acid" strokeWidth={1.8} />
              <span className="util mt-6 block text-dim">{f.kicker}</span>
              <h3 className="font-display mt-4 text-3xl leading-[1.05] font-bold tracking-tight md:text-4xl">
                {f.title}
              </h3>
              <p className="mt-6 text-sm leading-relaxed text-muted">{f.body}</p>
              <p className="mt-6 border-l border-acid/40 pl-4 text-sm text-acid/90">
                {f.footnote}
              </p>
            </article>
          ))}

          {/* Third card, offset low — breaks the two-column rhythm. */}
          <article className="col-span-12 md:col-span-6 lg:col-span-4 lg:col-start-3">
            <Power className="size-6 text-bad" strokeWidth={1.8} />
            <span className="util mt-6 block text-dim">Containment</span>
            <h3 className="font-display mt-4 text-3xl leading-[1.05] font-bold tracking-tight md:text-4xl">
              A kill switch the agent cannot undo
            </h3>
            <p className="mt-6 text-sm leading-relaxed text-muted">
              The agent may halt itself the moment something looks wrong — bad
              data, an unexpected loss, instructions it does not trust. It can
              never resume, and it can never widen a limit. Breaching the daily
              loss stop or the drawdown breaker halts trading automatically.
            </p>
            <p className="mt-6 border-l border-edge-bright pl-4 text-sm text-dim">
              Guardrails an agent can edit are not guardrails.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- loop ---- */

const STEPS = [
  {
    n: "01",
    tool: "sentinel_get_policy",
    text: "Read the limits and current headroom. Size the trade to fit.",
  },
  {
    n: "02",
    tool: "sentinel_evaluate_trade",
    text: "Submit the exact order. Receive ALLOW, BLOCK or NEEDS_APPROVAL.",
  },
  {
    n: "03",
    tool: "binance · place order",
    text: "Execute inside the Agentic sub-account — token in hand, never without.",
  },
  {
    n: "04",
    tool: "sentinel_confirm_fill",
    text: "Attest the fill against its token. Coverage stays at 100%.",
  },
];

function Loop() {
  return (
    <section className="relative border-b border-edge px-6 py-40 md:px-12 md:py-56">
      <div className="dot-grid-dense absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-[1600px]">
        <div className="grid grid-cols-12">
          <div className="col-span-12 lg:col-span-5">
            <span className="util text-dim">03 — The loop</span>
            <h2 className="font-display mt-8 text-5xl leading-[0.9] font-bold tracking-[-0.04em] md:text-6xl">
              Four calls,
              <br />
              every trade.
            </h2>
          </div>

          <ol className="col-span-12 mt-20 lg:col-span-6 lg:col-start-7 lg:mt-0">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="flex gap-6 border-t border-edge py-7 last:border-b"
              >
                <span className="font-display tnum text-xs font-bold text-acid">
                  {s.n}
                </span>
                <div>
                  <code className="font-mono text-sm text-fg">{s.tool}</code>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {s.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- footer ---- */

function Footer() {
  return (
    <footer className="px-6 py-32 md:px-12 md:py-48">
      <div className="mx-auto max-w-[1600px]">
        <div className="grid grid-cols-12 gap-y-16">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-display text-5xl leading-[0.9] font-bold tracking-[-0.04em] md:text-7xl">
              Let it trade.
              <br />
              <span className="text-dim">Keep the receipts.</span>
            </h2>
            <Link
              href="/dashboard"
              className="group mt-12 inline-flex items-center gap-3 rounded-full bg-acid px-8 py-4 text-sm font-semibold text-ink transition hover:bg-acid/85"
            >
              Open control plane
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="col-span-12 flex flex-col justify-end lg:col-span-4 lg:col-start-9">
            <div className="flex items-start gap-3 border-t border-edge pt-6">
              <Ban className="mt-0.5 size-3.5 shrink-0 text-dim" />
              <p className="text-xs leading-relaxed text-dim">
                Not financial advice. Hackathon software built for a demo trade
                of a few dollars — do not point it at meaningful capital.
              </p>
            </div>
            <p className="util mt-10 text-dim">
              Sentinel · Binance Agent OS Mini Hackathon
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
