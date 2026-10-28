"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "email" | "code"; email?: string; error?: string };

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/map");

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const supabase = await createClient();

  if (form.get("intent") === "send") {
    const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
    if (!email.success) return { step: "email", error: "Введите корректный email." };
    const { error } = await supabase.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: true } });
    if (error) {
      return {
        step: "email",
        error: error.status === 429 ? "Слишком много запросов. Подождите минуту." : "Не удалось отправить код. Попробуйте позже.",
      };
    }
    return { step: "code", email: email.data };
  }

  const email = String(form.get("email") ?? "");
  const token = String(form.get("token") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Введите код из письма." };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "Неверный или устаревший код." };
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
