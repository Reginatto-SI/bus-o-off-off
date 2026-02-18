import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/generated/build-info";

type VersionPayload = {
  version?: string;
  buildTime?: string;
};

const VERSION_ENDPOINT = "/version.json";
const VERSION_CHECK_INTERVAL_MS = 60_000;
const DISMISS_STORAGE_KEY = "smartbus:update-banner-dismissed-version";

export function VersionUpdateBanner() {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const isCheckingRef = useRef(false);

  const shouldShowBanner = Boolean(availableVersion) && !isDismissed;

  const checkForUpdates = useCallback(async () => {
    if (isCheckingRef.current) return;

    isCheckingRef.current = true;

    try {
      // Cache busting + no-store evitam retornar JSON antigo em CDNs/navegadores agressivos.
      const response = await fetch(`${VERSION_ENDPOINT}?_=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      if (!response.ok) return;

      const payload: VersionPayload = await response.json();
      const latestVersion = payload.version?.trim();

      if (!latestVersion || latestVersion === APP_VERSION) {
        setAvailableVersion(null);
        setIsDismissed(false);
        return;
      }

      const dismissedVersion = sessionStorage.getItem(DISMISS_STORAGE_KEY);
      setAvailableVersion(latestVersion);
      setIsDismissed(dismissedVersion === latestVersion);
    } catch (error) {
      // Falha silenciosa: não bloqueia uso do app em caso de rede intermitente.
      console.debug("Falha ao consultar version.json", error);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForUpdates();

    const interval = window.setInterval(() => {
      void checkForUpdates();
    }, VERSION_CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [checkForUpdates]);

  const handleDismiss = useCallback(() => {
    if (!availableVersion) return;
    sessionStorage.setItem(DISMISS_STORAGE_KEY, availableVersion);
    setIsDismissed(true);
  }, [availableVersion]);

  const handleRefreshNow = useCallback(() => {
    if (!availableVersion) return;

    sessionStorage.removeItem(DISMISS_STORAGE_KEY);

    // Atualiza a URL com parâmetro de versão para estimular novo request do HTML e assets.
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("v", availableVersion);
    window.location.replace(currentUrl.toString());
  }, [availableVersion]);


  if (!shouldShowBanner) return null;

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
          <Button size="sm" onClick={handleRefreshNow}>
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
