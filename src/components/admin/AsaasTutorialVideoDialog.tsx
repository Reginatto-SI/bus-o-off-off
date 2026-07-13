import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AsaasTutorialVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  videoUrl: string;
  iframeTitle: string;
  description?: string;
  autoplay?: boolean;
}

function buildYoutubeEmbedUrl(videoUrl: string, autoplay: boolean) {
  const url = new URL(videoUrl);

  if (autoplay) {
    // Comentário de manutenção: navegadores costumam bloquear autoplay com áudio; o mute mantém
    // o padrão de reprodução automática e permite ao usuário ativar o som manualmente no player.
    url.searchParams.set('autoplay', '1');
    url.searchParams.set('mute', '1');
  }

  url.searchParams.set('rel', '0');

  return url.toString();
}

export function AsaasTutorialVideoDialog({
  open,
  onOpenChange,
  title,
  videoUrl,
  iframeTitle,
  description,
  autoplay = false,
}: AsaasTutorialVideoDialogProps) {
  const embedUrl = open ? buildYoutubeEmbedUrl(videoUrl, autoplay) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Comentário de manutenção: componente compartilhado pelos tutoriais Asaas para preservar modal, responsividade e parada do vídeo ao fechar. */}
        <div className="overflow-hidden rounded-md border bg-black">
          <div className="aspect-video w-full">
            {embedUrl && (
              <iframe
                src={embedUrl}
                title={iframeTitle}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            )}
          </div>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
