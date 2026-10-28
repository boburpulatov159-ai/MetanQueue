import Link from "next/link";
import { Clock, Fuel, MapPinned, Search, ShieldCheck, Ticket } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

const features = [
  { icon: <Ticket />, title: "Онлайн-очередь", text: "Получите номер заранее и приезжайте к своему времени" },
  { icon: <Clock />, title: "Актуальная информация", text: "Количество машин, ожидание и наличие метана" },
  { icon: <MapPinned />, title: "Удобная карта", text: "Только проверенные заправки Ташкента" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <section className="relative overflow-hidden bg-navy-800 text-white">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(1,173,133,0.35),transparent_55%),radial-gradient(ellipse_at_10%_90%,rgba(14,54,58,0.9),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4">
          <header className="flex h-16 items-center justify-between gap-3">
            <Logo dark />
            <nav className="flex items-center gap-2">
              <Link href="/map" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:text-white sm:block">
                Карта
              </Link>
              <ButtonLink href="/login" variant="ghostDark" className="min-h-10 px-4 text-sm">
                Войти
              </ButtonLink>
            </nav>
          </header>

          <div className="max-w-2xl py-14 md:py-24">
            <h1 className="text-3xl leading-tight font-bold md:text-5xl">
              Метановые заправки Ташкента — <span className="text-accent-bright">без очередей</span>
            </h1>
            <p className="mt-4 text-base text-slate-300 md:text-lg">
              Найдите ближайшую заправку, встаньте в онлайн-очередь и приезжайте к своему времени.
            </p>
            <form action="/map" className="mt-8 flex max-w-xl gap-2 rounded-2xl bg-white p-2">
              <label htmlFor="q" className="sr-only">Поиск заправки</label>
              <div className="flex flex-1 items-center gap-2 pl-2 text-muted">
                <Search aria-hidden size={20} />
                <input
                  id="q"
                  name="q"
                  placeholder="Поиск по адресу или заправке"
                  className="min-h-11 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
                />
              </div>
              <button className="rounded-xl bg-accent px-4 font-semibold text-white hover:bg-accent-strong">Найти</button>
            </form>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/map">Открыть карту</ButtonLink>
              <ButtonLink href="/login" variant="ghostDark">Зарегистрироваться</ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-10 md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="flex gap-3">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
              {f.icon}
            </span>
            <div>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="text-sm text-muted">{f.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-navy-900 p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex gap-4">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-navy-700 text-accent-bright">
              <Fuel />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Вы владелец метановой заправки?</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
                <ShieldCheck aria-hidden size={16} /> Подключите заправку. После проверки она появится на карте.
              </p>
            </div>
          </div>
          <ButtonLink href="/owner/apply">Подключить заправку</ButtonLink>
        </div>
      </section>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} MetanQueue · Ташкент
      </footer>
    </div>
  );
}
