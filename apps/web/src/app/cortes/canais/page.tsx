import { ChannelsManager } from "@/components/channels/ChannelsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function CanaisPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Canais"
        description="Canais agrupam contas de publicação, presets padrão de análise e template de texto. Um canal só pode ter uma conta por plataforma."
      />

      <ChannelsManager />
    </div>
  );
}
