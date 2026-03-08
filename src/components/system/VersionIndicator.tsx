import { Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_BUILD_TIME } from "@/generated/build-info";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export function VersionIndicator() {
  const { currentVersion, hasUpdate, refresh } = useVersionCheck();

  const buildDate = (() => {
    try {
      return format(new Date(APP_BUILD_TIME), "dd/MM/yyyy, HH:mm");
    } catch {
      return "";
    }
  })();

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] leading-tight text-muted-foreground">
          Build {currentVersion}
          {buildDate && <> · {buildDate}</>}
        </span>

        {hasUpdate ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium leading-tight text-amber-500">
              Nova versão disponível
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:text-primary/80 gap-1"
              onClick={refresh}
            >
              <RefreshCw className="h-3 w-3" />
              Atualizar
            </Button>
          </div>
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
