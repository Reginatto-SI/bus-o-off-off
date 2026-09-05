import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type PixArtifacts = {
  qr_text: string | null;
  qr_image_url: string | null;
  expires_at: string | null;
  amount_cents: number | null;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; pix: PixArtifacts }
  | { kind: 'retry_later'; message: string }
  | { kind: 'error'; message: string };

function formatCents(cents: number | null): string | null {
  if (cents == null) return null;
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Painel de pagamento PIX PagBank exibido dentro do SmartBus.
 * Recupera o QR de forma idempotente (o backend nunca cria uma segunda cobrança
 * para a mesma venda) e nunca decide "pago": a confirmação vem do polling/verify.
 */
export function PagbankPixPanel({ saleId }: { saleId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const { data, error } = await supabase.functions.invoke('create-pagbank-payment', {
        body: { sale_id: saleId, payment_method: 'pix' },
      });
      let body = data;
      if (error && !body) {
        try {
          body = await (error as { context?: { json?: () => Promise<unknown> } }).context?.json?.();
        } catch {
          /* ignore */
        }
      }
      if (!error && body?.pix?.qr_text) {
        setState({ kind: 'ready', pix: body.pix });
        return;
      }
      const code = body?.error_code;
      if (code === 'pagbank_indeterminate' || code === 'pagbank_idempotency_conflict') {
        setState({ kind: 'retry_later', message: 'Estamos finalizando a geração do seu PIX. Toque em atualizar em alguns segundos.' });
        return;
      }
      if (body?.already_paid) {
        setState({ kind: 'retry_later', message: 'Pagamento já identificado. Aguarde a passagem aparecer.' });
        return;
      }
      setState({
        kind: 'error',
        message: typeof body?.message === 'string' && body.message.trim()
          ? body.message
          : 'Não foi possível carregar o PIX desta compra.',
      });
    } catch {
      setState({ kind: 'error', message: 'Falha de conexão ao carregar o PIX. Tente novamente.' });
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (state.kind !== 'ready' || !state.pix.expires_at) return null;
    const diff = Math.max(0, Math.floor((Date.parse(state.pix.expires_at) - now) / 1000));
    return { seconds: diff, label: `${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}` };
  }, [state, now]);

  const copy = async () => {
    if (state.kind !== 'ready' || !state.pix.qr_text) return;
    try {
      await navigator.clipboard.writeText(state.pix.qr_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard indisponível: o texto continua visível para seleção manual */
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        Gerando seu PIX…
      </div>
    );
  }

  if (state.kind === 'retry_later' || state.kind === 'error') {
    return (
      <div className="mt-4 rounded-lg border p-4 text-left text-sm space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-foreground">{state.message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar PIX
        </Button>
      </div>
    );
  }

  const expired = remaining !== null && remaining.seconds <= 0;
  const amount = formatCents(state.pix.amount_cents);

  return (
    <div className="mt-4 rounded-lg border bg-card p-4 text-left space-y-4">
      <div className="text-center space-y-1">
        <p className="font-semibold text-foreground">Pague com PIX para confirmar sua passagem</p>
        {amount && <p className="text-2xl font-bold text-foreground">{amount}</p>}
        {remaining && !expired && (
          <p className="text-xs text-muted-foreground">Este código expira em {remaining.label}</p>
        )}
        {expired && (
          <p className="text-xs text-destructive">Este código expirou. Toque em atualizar para verificar a situação.</p>
        )}
      </div>

      {state.pix.qr_text && !expired && (
        <div className="flex justify-center">
          <div className="rounded-lg bg-white p-3 border">
            <QRCodeSVG value={state.pix.qr_text} size={208} level="M" includeMargin={false} />
          </div>
        </div>
      )}

      {state.pix.qr_text && !expired && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Ou copie o código e pague no app do seu banco (PIX copia e cola):</p>
          <div className="rounded-md bg-muted/40 border p-2 text-[11px] break-all font-mono max-h-20 overflow-auto select-all">
            {state.pix.qr_text}
          </div>
          <Button className="w-full" onClick={copy} variant={copied ? 'secondary' : 'default'}>
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Código copiado' : 'Copiar código PIX'}
          </Button>
        </div>
      )}

      {expired && (
        <Button variant="outline" className="w-full" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      )}

      <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
        <li>Abra o app do seu banco e escolha pagar com PIX.</li>
        <li>Escaneie o QR Code ou cole o código copiado.</li>
        <li>Confirme o pagamento. Sua passagem aparece aqui automaticamente.</li>
      </ol>
    </div>
  );
}
