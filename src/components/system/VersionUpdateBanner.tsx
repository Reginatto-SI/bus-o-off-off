import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { useVersionCheck } from "@/hooks/use-version-check";

const DISMISS_STORAGE_KEY = "smartbus:update-banner-dismissed-version";

export function VersionUpdateBanner() {
  const { availableVersion, hasUpdate, refresh } = useVersionCheck();
  const [isDismissed, setIsDismissed] = useState(() => {
    if (!availableVersion) return false;
    return sessionStorage.getItem(DISMISS_STORAGE_KEY) === availableVersion;
  });

  // Re-check dismissed state when availableVersion changes
  const dismissed =
    isDismissed && sessionStorage.getItem(DISMISS_STORAGE_KEY) === availableVersion;

  if (!hasUpdate || dismissed) return null;

  const handleDismiss = () => {
    if (!availableVersion) return;
    sessionStorage.setItem(DISMISS_STORAGE_KEY, availableVersion);
    setIsDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-3xl rounded-lg border border-primary/30 bg-background/95 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">🚀 Tem atualização nova no Smartbus BR!</p>
          <p className="text-xs text-muted-foreground">
            Carregue a versão mais recente para aproveitar as melhorias.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={refresh}>
            Atualizar agora
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDismiss}>
            Depois
          </Button>
        </div>
      </div>
    </div>
  );
}
