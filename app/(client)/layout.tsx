import { ClientNav } from "@/components/nav";
import { Logo } from "@/components/logo";

export default function ClientLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <ClientNav />
        </div>
      </header>
      {/* bottom padding keeps content above the mobile tab bar */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 md:pb-10">{children}</main>
    </div>
  );
}
