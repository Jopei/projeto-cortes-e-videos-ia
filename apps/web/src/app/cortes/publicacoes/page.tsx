import { PublicacoesManager } from "@/components/publicacoes/PublicacoesManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function PublicacoesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Publicações"
        description="Histórico e status das publicações dos cortes aprovados em YouTube Shorts, TikTok, Bilibili, Reels e Vimeo."
      />

      <PublicacoesManager />
    </div>
  );
}
