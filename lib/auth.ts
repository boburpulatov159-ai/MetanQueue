import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  banned_until: string | null;
};

/** Signed-in user's profile, or null. JWT is verified by getClaims. */
export async function getProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return { supabase, profile: null, aal: null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", sub).single<Profile>();
  return { supabase, profile, aal: data.claims.aal as string | undefined };
}

export async function requireProfile(next: string) {
  const r = await getProfile();
  if (!r.profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { ...r, profile: r.profile };
}
