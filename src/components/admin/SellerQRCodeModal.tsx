/**
 * Modal de QR Code do vendedor.
 *
 * Exibe o QR Code do link curto do vendedor com opções de:
 * - Copiar link curto
 * - Baixar QR Code em SVG (serializa o SVG do DOM)
 * - Baixar QR Code em PNG (renderiza SVG em canvas e exporta)
 *
 * O QR Code é gerado a partir do link curto (/v/{short_code})
 * para manter o código QR mais limpo e compacto.
 *
 * Usa `QRCodeSVG` do pacote `qrcode.react` (já instalado no projeto).
 */
import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Download, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SellerQRCodeModalProps {
  sellerName: string;
  shortCode?: string;
  qrLinkOverride?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SellerQRCodeModal({
  sellerName,
  shortCode,
  qrLinkOverride,
  open,
  onOpenChange,
}: SellerQRCodeModalProps) {
  const qrRef = useRef<HTMLDivElement>(null);

  /**
   * Reuso do mesmo modal para vendedor e representante:
   * - vendedor segue com link curto `/v/{short_code}`
   * - representante injeta `qrLinkOverride` com link oficial já validado pela tela
   */
  const shortLink = qrLinkOverride ?? (shortCode ? `${window.location.origin}/v/${shortCode}` : '');

  const handleCopyLink = () => {
    if (!shortLink) {
      toast.error('Link indisponível para cópia');
      return;
    }
    navigator.clipboard.writeText(shortLink).then(
      () => toast.success('Link copiado!'),
      () => toast.error('Falha ao copiar link')
    );
  };

  /**
   * Baixar QR Code em SVG.
   * Serializa o elemento SVG do DOM e cria um Blob para download.
   */
  const handleDownloadSVG = () => {
    if (!shortLink) {
      toast.error('Link indisponível para gerar SVG');
      return;
    }
    const svgElement = qrRef.current?.querySelector('svg');
    if (!svgElement) {
      toast.error('Erro ao gerar SVG');
      return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `qrcode-${sellerName.replace(/\s+/g, '-').toLowerCase()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('SVG baixado!');
  };

  /**
   * Baixar QR Code em PNG.
   * Renderiza o SVG em um canvas e exporta como PNG.
   */
  const handleDownloadPNG = () => {
    if (!shortLink) {
      toast.error('Link indisponível para gerar PNG');
      return;
    }
    const svgElement = qrRef.current?.querySelector('svg');
    if (!svgElement) {
      toast.error('Erro ao gerar PNG');
      return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Renderizar em 4x para boa qualidade
      const scale = 4;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `qrcode-${sellerName.replace(/\s+/g, '-').toLowerCase()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        toast.success('PNG baixado!');
      }, 'image/png');

      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code — {sellerName}</DialogTitle>
          <DialogDescription>
            Use este QR Code em banners, flyers ou adesivos para divulgação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* QR Code SVG — ref para serialização */}
          <div ref={qrRef} className="rounded-lg border bg-white p-4">
            <QRCodeSVG
              value={shortLink}
              size={220}
              level="H"
              includeMargin={false}
            />
          </div>

          {/* Link curto com botão copiar */}
          <div className="flex items-center gap-2 w-full max-w-xs">
            <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-sm font-mono">
              {shortLink}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopyLink} title="Copiar link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          {/* Botões de download */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleDownloadSVG}>
              <Download className="h-4 w-4 mr-2" />
              Baixar SVG
            </Button>
            <Button variant="outline" onClick={handleDownloadPNG}>
              <Image className="h-4 w-4 mr-2" />
              Baixar PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
