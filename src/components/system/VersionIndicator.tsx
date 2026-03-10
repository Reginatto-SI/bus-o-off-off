import { Clock, CheckCircle2, Loader2 } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_BUILD_TIME } from "@/generated/build-info";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toast } from "sonner";

export function VersionIndicator() {
  const { currentVersion, hasUpdate, refresh, isChecking, checkForUpdates } = useVersionCheck();

  const buildDate = (() => {
    try {
      return format(new Date(APP_BUILD_TIME), "dd/MM/yyyy, HH:mm");
    } catch {
      return "";
    }
  })();

  const handleManualVersionCheck = async () => {
    if (isChecking) return;

    // Mantém o fluxo manual reutilizando a checagem já existente (version.json + APP_VERSION),
    // evitando duplicidade visual e técnica no header.
    const result = await checkForUpdates();

    if (result.status === "update-available") {
      toast.success("Nova versão encontrada. Atualizando sistema...");
      await refresh(result.latestVersion);
      return;
    }

    if (result.status === "up-to-date") {
      toast.info("Sistema já está na versão mais recente");
      return;
    }

    toast.error("Não foi possível verificar atualização agora");
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground hover:text-primary"
        onClick={() => void handleManualVersionCheck()}
        disabled={isChecking}
        title="Verificar e atualizar sistema"
        aria-label="Verificar e atualizar sistema"
      >
        {isChecking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Clock className="h-3.5 w-3.5" />
        )}
      </Button>

      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] leading-tight text-muted-foreground">
          Build {currentVersion}
          {buildDate && <> · {buildDate}</>}
        </span>

        {isChecking ? (
          <span className="text-[11px] font-medium leading-tight text-muted-foreground">
            Verificando atualização...
          </span>
        ) : hasUpdate ? (
          <span className="text-[11px] font-medium leading-tight text-amber-500">
            Nova versão disponível
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-medium leading-tight text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            Sistema atualizado
          </span>
        )}
      </div>
    </div>
  );
}
