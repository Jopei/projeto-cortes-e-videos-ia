import { SourcesManager } from "@/components/sources/SourcesManager";
import { Callout } from "@/components/ui/Callout";
import { PageHeader } from "@/components/ui/PageHeader";

export default function FontesLicencasPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Fontes & Licenças"
        description="Cadastro das fontes de vídeo (licenciadas ou de domínio público) e do tipo de licença associada a cada uma, incluindo trilhas e dublagens usadas nos cortes."
      />

      <Callout variant="warning" role="alert" title="Aviso de licenciamento" className="mb-6">
        <ul className="list-disc space-y-1 pl-5">
          <li>Nenhum corte é publicado sem licença válida verificada.</li>
          <li>
            Dublagens e trilhas sonoras podem ter direitos próprios, distintos dos direitos do vídeo
            original — precisam de licença separada.
          </li>
          <li>
            Conteúdo sob licenças CC-NC (não comercial) e CC-ND (sem derivações) é bloqueado para
            monetização.
          </li>
        </ul>
      </Callout>

      <SourcesManager />
    </div>
  );
}
