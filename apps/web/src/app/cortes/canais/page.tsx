import { ChannelsManager } from "@/components/channels/ChannelsManager";

export default function CanaisPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Canais</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Canais agrupam contas de publicação, presets padrão de análise e template de texto. Um
          canal só pode ter uma conta por plataforma.
        </p>
      </div>

      <ChannelsManager />
    </div>
  );
}
