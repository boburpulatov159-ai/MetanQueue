"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Setup = { factorId: string; qr?: string; secret?: string };

export function MfaForm({ next }: { next: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setError("Не удалось загрузить настройки защиты.");
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setSetup({ factorId: verified.id });
      // drop half-finished enrollments so a new one can be created
      for (const f of data.all.filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const en = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MetanQueue" });
      if (en.error) return setError("Не удалось включить защиту. Обновите страницу.");
      setSetup({ factorId: en.data.id, qr: en.data.totp.qr_code, secret: en.data.totp.secret });
    })();
  }, []);

  async function verify(form: FormData) {
    if (!setup) return;
    setPending(true);
    setError(undefined);
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: setup.factorId, code });
    setPending(false);
    if (error) return setError("Неверный код. Проверьте время на телефоне и попробуйте снова.");
    router.replace(next);
    router.refresh();
  }

  if (!setup) return error ? <Alert>{error}</Alert> : <p className="text-sm text-muted">Загрузка…</p>;

  return (
    <form action={verify} className="flex flex-col gap-4">
      {setup.qr ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Установите Google Authenticator, Microsoft Authenticator или аналог.</li>
            <li>Отсканируйте QR-код или введите ключ вручную.</li>
            <li>Введите 6 цифр из приложения.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: SVG from Supabase */}
          <img src={setup.qr} alt="QR-код для приложения-аутентификатора" className="mx-auto size-48 rounded-xl border border-line bg-white p-2" />
          <p className="text-center text-xs break-all text-muted">
            Ключ: <code className="font-mono text-ink">{setup.secret}</code>
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Введите 6 цифр из приложения-аутентификатора.</p>
      )}
      <Field label="Код из приложения" error={error}>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} className="text-center text-2xl tracking-[0.4em]" />
      </Field>
      <Button disabled={pending}>{pending ? "Проверяем…" : "Подтвердить"}</Button>
    </form>
  );
}
