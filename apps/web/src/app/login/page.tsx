import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Entrar · Projetos Cortes",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <div className="w-full max-w-sm">
        <ThemeToggle />
      </div>
    </div>
  );
}
