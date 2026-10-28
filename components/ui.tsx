import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const buttonVariants = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  outline: "border border-line bg-white text-ink hover:border-accent hover:text-accent-ink",
  ghostDark: "border border-white/40 text-white hover:bg-white/10",
  danger: "bg-danger text-white hover:brightness-95",
  soft: "bg-accent-soft text-accent-ink hover:bg-[#d5efe5]",
};
type Variant = keyof typeof buttonVariants;

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cx(buttonBase, buttonVariants[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

const tones = {
  ok: "bg-accent-soft text-accent-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-canvas text-muted",
};
export type Tone = keyof typeof tones;

/** Status is never conveyed by color alone: the dot is decorative, the text carries meaning. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-3">
      <span aria-hidden className="text-accent">{icon}</span>
      <span className="text-xs text-muted">{label}</span>
      <span className="text-[15px] font-semibold">{value}</span>
    </div>
  );
}

const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-danger";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs font-medium text-danger-ink">
          {error}
        </span>
      )}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "appearance-auto", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "min-h-24 py-3", className)} {...props} />;
}

export function Alert({ tone = "danger", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-xl px-4 py-3 text-sm font-medium", tones[tone])}>
      {children}
    </div>
  );
}

export function PageTitle({ children, back }: { children: ReactNode; back?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {back && (
        <Link href={back} aria-label="Назад" className="-ml-2 rounded-lg p-2 text-ink hover:bg-white">
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
      )}
      <h1 className="text-xl font-bold md:text-2xl">{children}</h1>
    </div>
  );
}

export { cx };
