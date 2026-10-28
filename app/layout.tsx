import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// latin-ext covers Uzbek Latin letters (oʻ, gʻ, sh, ch)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "MetanQueue", template: "%s — MetanQueue" },
  description: "Онлайн-очередь на метановые заправки Ташкента",
};

export const viewport: Viewport = {
  themeColor: "#112533",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
