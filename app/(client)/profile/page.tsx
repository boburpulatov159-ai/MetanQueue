import Link from "next/link";
import { Car, ChevronRight, Fuel, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageTitle } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatPhone } from "@/lib/labels";
import { signOut } from "../login/actions";
import { addVehicle, deleteVehicle, saveProfile } from "./actions";

export const metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const { supabase, profile } = await requireProfile("/profile");
  const [{ data: vehicles }, { data: memberships }] = await Promise.all([
    supabase.from("vehicles").select("id, plate, model").order("created_at"),
    supabase.from("station_members").select("station_id").eq("user_id", profile.id).limit(1),
  ]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageTitle>Профиль</PageTitle>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Личные данные</h2>
        <ActionForm action={saveProfile} submit="Сохранить">
          <Field label="Имя">
            <Input name="full_name" defaultValue={profile.full_name ?? ""} required maxLength={100} autoComplete="name" />
          </Field>
          <Field label="Телефон" hint="Нужен заправке для связи и владельцам для подключения">
            <Input
              name="phone"
              type="tel"
              defaultValue={profile.phone ? formatPhone(profile.phone) : ""}
              placeholder="+998 90 123 45 67"
              required
              autoComplete="tel"
            />
          </Field>
        </ActionForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Car aria-hidden size={18} className="text-accent" /> Мои машины
        </h2>
        <ul className="mb-4 flex flex-col divide-y divide-line">
          {vehicles?.map((v) => (
            <li key={v.id} className="flex items-center justify-between py-2.5">
              <span>
                <b className="font-mono tracking-wide">{v.plate}</b>
                {v.model && <span className="ml-2 text-sm text-muted">{v.model}</span>}
              </span>
              <form action={deleteVehicle}>
                <input type="hidden" name="id" value={v.id} />
                <button aria-label={`Удалить ${v.plate}`} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger-ink">
                  <Trash2 size={18} />
                </button>
              </form>
            </li>
          ))}
          {!vehicles?.length && <li className="py-2 text-sm text-muted">Добавьте машину, чтобы вставать в очередь.</li>}
        </ul>
        <ActionForm action={addVehicle} submit="Добавить машину" className="grid gap-3 sm:grid-cols-2">
          <Field label="Госномер">
            <Input name="plate" required placeholder="01 A 123 BC" autoCapitalize="characters" />
          </Field>
          <Field label="Модель (необязательно)">
            <Input name="model" placeholder="Nexia, Cobalt…" maxLength={60} />
          </Field>
        </ActionForm>
      </Card>

      <Card className="divide-y divide-line">
        <Link href={memberships?.length ? "/owner" : "/owner/apply"} className="flex items-center gap-3 p-4 hover:bg-canvas">
          <Fuel aria-hidden className="text-accent" size={20} />
          <span className="flex-1 font-medium">{memberships?.length ? "Кабинет заправки" : "Подключить свою заправку"}</span>
          <ChevronRight aria-hidden size={18} className="text-muted" />
        </Link>
        {profile.is_admin && (
          <Link href="/admin" className="flex items-center gap-3 p-4 hover:bg-canvas">
            <ShieldCheck aria-hidden className="text-accent" size={20} />
            <span className="flex-1 font-medium">Панель администратора</span>
            <ChevronRight aria-hidden size={18} className="text-muted" />
          </Link>
        )}
        <form action={signOut}>
          <button className="flex w-full items-center gap-3 p-4 text-left text-danger-ink hover:bg-danger-soft">
            <LogOut aria-hidden size={20} /> Выйти
          </button>
        </form>
      </Card>
    </div>
  );
}
