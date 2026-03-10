import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/generated/build-info";

const VERSION_ENDPOINT = "/version.json";
const VERSION_CHECK_INTERVAL_MS = 60_000;

type VersionPayload = { version?: string; buildTime?: string };
type VersionCheckResult = {
  status: "up-to-date" | "update-available" | "request-failed";
  latestVersion?: string;
};

export function useVersionCheck() {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const isCheckingRef = useRef(false);

  const hasUpdate = Boolean(availableVersion);

  const checkForUpdates = useCallback(async (): Promise<VersionCheckResult> => {
    // O mesmo método atende o polling automático e o botão manual no header,
    // mantendo uma única fonte de verdade para descoberta de nova versão.
    if (isCheckingRef.current) return { status: "up-to-date" };
    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      const response = await fetch(`${VERSION_ENDPOINT}?_=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      if (!response.ok) return { status: "request-failed" };

      const payload: VersionPayload = await response.json();
      const latestVersion = payload.version?.trim();

      if (!latestVersion || latestVersion === APP_VERSION) {
        setAvailableVersion(null);
        return { status: "up-to-date" };
      }

      setAvailableVersion(latestVersion);
      return { status: "update-available", latestVersion };
    } catch (error) {
      console.debug("Falha ao consultar version.json", error);
      return { status: "request-failed" };
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkForUpdates();
    const interval = window.setInterval(() => void checkForUpdates(), VERSION_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [checkForUpdates]);

  const refresh = useCallback(async (targetVersion?: string) => {
    // O refresh reaproveita a rotina existente para limpar caches/SW antes do reload,
    // reduzindo dúvidas de versão e ajudando o suporte em atualizações assistidas.
    const versionToApply = targetVersion ?? availableVersion;
    if (!versionToApply) return;

    // Limpar Cache Storage (PWA / service worker caches)
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.debug("Falha ao limpar caches", e);
    }

    // Unregister service workers
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.debug("Falha ao remover service workers", e);
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("v", versionToApply);
    window.location.replace(currentUrl.toString());
  }, [availableVersion]);

  return {
    currentVersion: APP_VERSION,
    availableVersion,
    hasUpdate,
    isChecking,
    checkForUpdates,
    refresh,
  };
}
