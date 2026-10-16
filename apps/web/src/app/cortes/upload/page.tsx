import { UploadManager } from "@/components/upload/UploadManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function UploadPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Upload"
        description="Envio de vídeos-fonte (e legendas) que servirão de base para os cortes verticais."
      />

      <div className="max-w-4xl"><UploadManager /></div>
    </div>
  );
}
