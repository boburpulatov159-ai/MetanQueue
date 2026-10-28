"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { errorMessage, normalizePhone, normalizePlate, PLATE_RE } from "@/lib/labels";

export type FormState = { error?: string; ok?: string };

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Введите имя").max(100),
  phone: z.string().transform((s, ctx) => {
    const p = normalizePhone(s);
    if (!p) ctx.addIssue({ code: "custom", message: "Телефон в формате +998 90 123 45 67" });
    return p ?? "";
  }),
});

export async function saveProfile(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, profile } = await requireProfile("/profile");
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", profile.id);
  if (error) return { error: error.code === "23505" ? "Этот телефон уже привязан к другому аккаунту." : errorMessage(error) };
  revalidatePath("/profile");
  return { ok: "Сохранено" };
}

export async function addVehicle(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, profile } = await requireProfile("/profile");
  const plate = normalizePlate(String(form.get("plate") ?? ""));
  if (!PLATE_RE.test(plate)) return { error: "Госномер в формате 01 A 123 BC" };
  const model = String(form.get("model") ?? "").trim().slice(0, 60) || null;
  const { error } = await supabase.from("vehicles").insert({ user_id: profile.id, plate, model });
  if (error) return { error: error.code === "23505" ? "Эта машина уже добавлена." : errorMessage(error) };
  revalidatePath("/profile");
  return { ok: "Машина добавлена" };
}

export async function deleteVehicle(form: FormData) {
  const { supabase } = await requireProfile("/profile");
  // RLS limits deletion to the caller's own vehicles
  await supabase.from("vehicles").delete().eq("id", String(form.get("id")));
  revalidatePath("/profile");
}
