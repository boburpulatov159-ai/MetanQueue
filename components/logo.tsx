import Link from "next/link";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32">
      <path d="M16 2C16 2 6 13 6 20a10 10 0 0 0 20 0C26 13 16 2 16 2Z" fill="#01AD85" />
      <path d="M16 13c0 0-5 5.5-5 9a5 5 0 0 0 10 0c0-3.5-5-9-5-9Z" fill="#E6F6F0" />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2 text-lg font-bold ${dark ? "text-white" : "text-ink"}`}>
      <LogoMark />
      MetanQueue
    </Link>
  );
}
