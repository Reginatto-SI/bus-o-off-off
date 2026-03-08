import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/generated/build-info";

const VERSION_ENDPOINT = "/version.json";
const VERSION_CHECK_INTERVAL_MS = 60_000;

type VersionPayload = { version?: string; buildTime?: string };

export function useVersionCheck() {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const isCheckingRef = useRef(false);

  const hasUpdate = Boolean(availableVersion);

  const checkForUpdates = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
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
        return;
      }

      setAvailableVersion(latestVersion);
    } catch (error) {
      console.debug("Falha ao consultar version.json", error);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForUpdates();
    const interval = window.setInterval(() => void checkForUpdates(), VERSION_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [checkForUpdates]);

  const refresh = useCallback(() => {
    if (!availableVersion) return;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("v", availableVersion);
    window.location.replace(currentUrl.toString());
  }, [availableVersion]);

  return {
    currentVersion: APP_VERSION,
    availableVersion,
    hasUpdate,
    refresh,
  };
}
