import { Check, Copy, Info } from 'lucide-react';
import { useState } from 'react';
import { useBuildVersionDetails } from '@/hooks/use-build-version-details';
import { useRuntimePaymentEnvironment } from '@/hooks/use-runtime-payment-environment';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function FooterVersionInfo() {
  const { currentVersion, buildDate, buildDateWithTimezone, buildTimeZoneLabel, statusLabel } = useBuildVersionDetails();
  const { environment } = useRuntimePaymentEnvironment();
  const [copied, setCopied] = useState(false);

  const environmentLabel = environment === 'production'
    ? 'Produção'
    : environment === 'sandbox'
      ? 'Sandbox'
      : null;

  const versionText = [
    `Build: ${currentVersion}`,
    buildDateWithTimezone ? `Gerada em: ${buildDateWithTimezone}` : null,
    buildTimeZoneLabel ? `Fuso da build: ${buildTimeZoneLabel}` : null,
    `Status: ${statusLabel}`,
    environmentLabel ? `Ambiente: ${environmentLabel}` : null,
  ].filter(Boolean).join('\n');

  const handleCopyVersion = async () => {
    // Cópia usa apenas dados públicos da build/ambiente, sem secrets, URLs internas ou tokens.
    if (!navigator.clipboard) return;

    await navigator.clipboard.writeText(versionText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-1 inline-flex h-9 w-9 shrink-0 align-middle text-muted-foreground hover:text-primary"
          aria-label="Ver informações da versão do sistema"
          title="Ver informações da versão"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 text-left" align="center" sideOffset={8}>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Informações da build</p>
            <p className="text-xs text-muted-foreground">Use para confirmar a versão em testes.</p>
          </div>

          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Build</dt>
              <dd className="font-medium text-foreground">{currentVersion}</dd>
            </div>
            {buildDate && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Gerada em</dt>
                <dd className="font-medium text-foreground">{buildDate}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Fuso da build</dt>
              <dd className="font-medium text-foreground">{buildTimeZoneLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium text-foreground">{statusLabel}</dd>
            </div>
            {environmentLabel && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Ambiente</dt>
                <dd className="font-medium text-foreground">{environmentLabel}</dd>
              </div>
            )}
          </dl>

          <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => void handleCopyVersion()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Dados copiados' : 'Copiar dados da versão'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
