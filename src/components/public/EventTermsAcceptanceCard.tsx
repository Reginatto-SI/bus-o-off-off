import { useMemo, useState } from "react";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface PublicEventTerm {
  linkId: string;
  termId: string;
  termVersionId: string;
  acceptanceRequired: boolean;
  selectionMode: string;
  title: string;
  termType: string;
  versionNumber: number;
  summary: string | null;
  content: string;
  publishedAt: string | null;
}

interface EventTermsAcceptanceCardProps {
  terms: PublicEventTerm[];
  loading: boolean;
  error: boolean;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}

const TERM_TYPE_LABELS: Record<string, string> = {
  termos_servico: "Termos de serviço",
  politica_cancelamento: "Política de cancelamento",
  politica_reembolso: "Política de reembolso",
  regras_embarque: "Regras de embarque",
  regras_evento: "Regras do evento",
  personalizado: "Personalizado",
};

function formatTermType(termType: string): string {
  return TERM_TYPE_LABELS[termType] ?? termType.replace(/_/g, " ");
}

function formatPublishedAt(value: string | null): string {
  if (!value) return "Data de publicação não informada";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data de publicação não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function EventTermsAcceptanceCard({
  terms,
  loading,
  error,
  accepted,
  onAcceptedChange,
}: EventTermsAcceptanceCardProps) {
  const [selectedTerm, setSelectedTerm] = useState<PublicEventTerm | null>(
    null,
  );
  // Comentário Fase 4A: este componente apenas exibe termos e controla aceite visual recebido do checkout.
  const hasRequiredTerms = useMemo(
    () => terms.some((term) => term.acceptanceRequired),
    [terms],
  );

  if (!loading && !error && terms.length === 0) return null;

  return (
    <div
      className={`rounded-lg border p-4 space-y-4 ${hasRequiredTerms && !accepted ? "border-orange-500/40 bg-orange-500/5" : "bg-card"}`}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Termos e Políticas do Evento
        </h3>
        <p className="text-xs text-muted-foreground">
          Leia os termos e políticas definidos pela empresa responsável antes de
          continuar para o pagamento.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando termos do evento...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Não foi possível carregar os termos deste evento. Tente novamente em
            instantes.
          </span>
        </div>
      )}

      {!loading && !error && terms.length > 0 && (
        <>
          <div className="space-y-3">
            {terms.map((term) => (
              <div
                key={term.linkId}
                className="rounded-md border bg-background p-3 space-y-2"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">
                      {term.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {formatTermType(term.termType)}
                      </Badge>
                      <span>Versão {term.versionNumber}</span>
                      <span>•</span>
                      <span>{formatPublishedAt(term.publishedAt)}</span>
                    </div>
                  </div>
                  <Badge
                    variant={term.acceptanceRequired ? "default" : "outline"}
                  >
                    {term.acceptanceRequired
                      ? "Aceite obrigatório"
                      : "Informativo"}
                  </Badge>
                </div>

                {term.summary && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {term.summary}
                  </p>
                )}

                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => setSelectedTerm(term)}
                >
                  Ler conteúdo completo
                </Button>
              </div>
            ))}
          </div>

          {hasRequiredTerms && (
            <div className="flex items-start gap-3 rounded-md border bg-background p-3">
              <Checkbox
                id="event-terms-acceptance"
                checked={accepted}
                onCheckedChange={(checked) =>
                  onAcceptedChange(checked === true)
                }
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="event-terms-acceptance"
                  className="cursor-pointer leading-snug"
                >
                  Li e aceito os Termos e Políticas aplicáveis a este evento.
                </Label>
                <p className="text-xs text-muted-foreground">
                  O aceite é necessário para continuar quando a empresa
                  responsável exige ciência dos termos do evento.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={Boolean(selectedTerm)}
        onOpenChange={(open) => !open && setSelectedTerm(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTerm?.title}</DialogTitle>
            <DialogDescription>
              {selectedTerm
                ? `${formatTermType(selectedTerm.termType)} • Versão ${selectedTerm.versionNumber} • ${formatPublishedAt(selectedTerm.publishedAt)}`
                : "Conteúdo do termo"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/20 p-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {selectedTerm?.content}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" onClick={() => setSelectedTerm(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
