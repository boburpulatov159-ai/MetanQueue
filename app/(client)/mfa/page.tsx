import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Защита аккаунта" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const { next } = await searchParams;
  const safe = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/owner";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-6">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <ShieldCheck size={28} />
      </span>
      <div className="text-center">
        <h1 className="text-2xl font-bold">Защита кабинета</h1>
        <p className="mt-1 text-sm text-muted">
          Кабинет заправки и панель администратора доступны только со вторым фактором входа.
        </p>
      </div>
      <Card className="w-full p-5">
        <MfaForm next={safe} />
      </Card>
    </div>
  );
}
