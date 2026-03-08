import { RefreshCw } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function VersionIndicator() {
  const { currentVersion, hasUpdate, refresh } = useVersionCheck();

  if (hasUpdate) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">
          v{currentVersion}
        </span>
        <span className="text-[11px] text-muted-foreground">•</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-1.5 py-0.5 text-[11px] font-medium text-primary hover:text-primary/80 gap-1"
          onClick={refresh}
        >
          <RefreshCw className="h-3 w-3" />
          Atualizar
        </Button>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-[11px] text-muted-foreground cursor-default select-none">
          v{currentVersion}
        </span>
      </TooltipTrigger>
      <TooltipContent>Versão atual do sistema</TooltipContent>
    </Tooltip>
  );
}
