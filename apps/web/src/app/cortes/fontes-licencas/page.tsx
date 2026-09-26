import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function FontesLicencasPage() {
  return (
    <PlaceholderPage
      title="Fontes & Licenças"
      description="Cadastro das fontes de vídeo (licenciadas ou de domínio público) e do tipo de licença associada a cada uma, incluindo trilhas e dublagens usadas nos cortes."
    >
      <div
        role="alert"
        className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <p className="font-semibold">Aviso de licenciamento</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Nenhum corte é publicado sem licença válida verificada.</li>
          <li>
            Dublagens e trilhas sonoras podem ter direitos próprios, distintos
            dos direitos do vídeo original — precisam de licença separada.
          </li>
          <li>
            Conteúdo sob licenças CC-NC (não comercial) e CC-ND (sem
            derivações) é bloqueado para monetização.
          </li>
        </ul>
      </div>
    </PlaceholderPage>
  );
}
