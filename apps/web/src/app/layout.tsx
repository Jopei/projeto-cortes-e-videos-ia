import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavCountsProvider } from "@/lib/nav-counts";
import { ThemeScript } from "@/components/ThemeScript";
import { AppShell } from "@/components/AppShell";
import { ChannelProvider } from "@/lib/channel-context";
import { AdminViewProvider } from "@/lib/admin-view";
import { AuthProvider } from "@/lib/user-context";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Projetos Cortes",
  description:
    "Painel para gerar cortes verticais de vídeos licenciados e publicar em Shorts, TikTok, Bilibili, Reels e Vimeo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen">
        <ToastProvider>
          <AuthProvider>
            <AdminViewProvider>
              <ChannelProvider>
                <NavCountsProvider>
                  <AppShell>{children}</AppShell>
                </NavCountsProvider>
              </ChannelProvider>
            </AdminViewProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
