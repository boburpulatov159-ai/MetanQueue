"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { step: "email" });

  if (state.step === "code") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Мы отправили код на <b className="text-ink">{state.email}</b>. Проверьте также папку «Спам».
        </p>
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="next" value={next ?? ""} />
        <input type="hidden" name="intent" value="verify" />
        <Field label="Код из письма" error={state.error}>
          <Input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={10}
            aria-invalid={!!state.error}
            className="text-center text-2xl tracking-[0.4em]"
          />
        </Field>
        <Button disabled={pending}>{pending ? "Проверяем…" : "Войти"}</Button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="send" />
      <Field label="Email" error={state.error} hint="Пришлём одноразовый код для входа. Пароль не нужен.">
        <Input name="email" type="email" autoComplete="email" required placeholder="name@mail.uz" aria-invalid={!!state.error} />
      </Field>
      <Button disabled={pending}>{pending ? "Отправляем…" : "Получить код"}</Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
