import { PublicacoesManager } from "@/components/publicacoes/PublicacoesManager";

export default function PublicacoesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Publicações</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Histórico e status das publicações dos cortes aprovados em YouTube Shorts, TikTok,
          Bilibili e Reels.
        </p>
      </div>

      <PublicacoesManager />
    </div>
  );
}
