import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/ThemeScript";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Projetos Cortes",
  description:
    "Painel para gerar cortes verticais de vídeos licenciados e publicar em Shorts, TikTok, Bilibili e Reels.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-900 dark:text-slate-100">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
