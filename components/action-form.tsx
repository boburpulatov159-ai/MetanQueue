"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, Button } from "./ui";

type State = { error?: string; ok?: string };

/** Form bound to a server action returning {error|ok}; shows the result under the fields. */
export function ActionForm({
  action,
  submit,
  children,
  className = "flex flex-col gap-4",
}: {
  action: (s: State, f: FormData) => Promise<State>;
  submit: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className={className}>
      {children}
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="ok">{state.ok}</Alert>}
      <Button disabled={pending}>{pending ? "Сохраняем…" : submit}</Button>
    </form>
  );
}
