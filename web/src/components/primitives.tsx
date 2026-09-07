import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-edge bg-panel/80 backdrop-blur ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-dim" strokeWidth={2} />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {title}
          </h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A labelled budget bar — the core risk-gauge unit. */
export function Meter({
  label,
  value,
  limitLabel,
  utilisation,
  tone = "auto",
  icon: Icon,
}: {
  label: string;
  value: string;
  limitLabel: string;
  utilisation: number;
  tone?: "auto" | "good" | "bad";
  icon: LucideIcon;
}) {
  const u = Math.max(0, Math.min(1, utilisation));
  const colour =
    tone === "good"
      ? "bg-acid"
      : tone === "bad"
        ? "bg-bad"
        : u >= 0.9
          ? "bg-bad"
          : u >= 0.6
            ? "bg-warn"
            : "bg-acid";

  return (
    <div className="rounded-xl border border-edge bg-panel/80 p-3.5">
      <div className="flex items-center gap-1.5 text-dim">
        <Icon className="size-3.5" strokeWidth={2} />
        <span className="util">{label}</span>
      </div>
      <div className="font-display tnum mt-2.5 text-2xl font-bold tracking-tight text-fg">
        {value}
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-edge">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colour}`}
          style={{ width: `${u * 100}%` }}
        />
      </div>
      <div className="mt-1.5 tnum text-[10px] text-dim">{limitLabel}</div>
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const tones = {
    neutral: "border-edge-bright bg-panel-2 text-muted",
    good: "border-acid/30 bg-acid/10 text-acid",
    bad: "border-bad/30 bg-bad/10 text-bad",
    warn: "border-warn/30 bg-warn/10 text-warn",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Icon className="size-5 text-dim" strokeWidth={1.5} />
      <p className="max-w-xs text-xs leading-relaxed text-dim">{text}</p>
    </div>
  );
}
