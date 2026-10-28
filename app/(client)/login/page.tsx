import { LogoMark } from "@/components/logo";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-8">
      <LogoMark size={48} />
      <div className="text-center">
        <h1 className="text-2xl font-bold">Вход и регистрация</h1>
        <p className="mt-1 text-sm text-muted">Один аккаунт для водителей и владельцев заправок</p>
      </div>
      <Card className="w-full p-5">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </Card>
    </div>
  );
}
