import { UploadManager } from "@/components/upload/UploadManager";

export default function UploadPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Upload
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Envio de vídeos-fonte (e legendas) que servirão de base para os
          cortes verticais.
        </p>
      </div>

      <UploadManager />
    </div>
  );
}
