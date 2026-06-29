import { useMemo } from "react";
import { APP_BUILD_TIME } from "@/generated/build-info";
import { useVersionCheck } from "@/hooks/use-version-check";

const BUILD_TIME_ZONE = "America/Cuiaba";
const BUILD_TIME_ZONE_LABEL = "Cuiabá/MT";

export function useBuildVersionDetails() {
  const versionState = useVersionCheck();

  const buildDate = useMemo(() => {
    try {
      // Formatação fixa no fuso oficial da operação para evitar divergência entre Android, iPhone e desktop.
      const parts = new Intl.DateTimeFormat("pt-BR", {
        timeZone: BUILD_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(APP_BUILD_TIME));

      const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${valueByType.day}/${valueByType.month}/${valueByType.year}, ${valueByType.hour}:${valueByType.minute}`;
    } catch {
      return "";
    }
  }, []);

  const statusLabel = versionState.isChecking
    ? "Verificando atualização..."
    : versionState.hasUpdate
      ? "Nova versão disponível"
      : "Sistema atualizado";

  return {
    ...versionState,
    buildDate,
    buildDateWithTimezone: buildDate ? `${buildDate} — ${BUILD_TIME_ZONE_LABEL}` : "",
    buildTime: APP_BUILD_TIME,
    buildTimeZone: BUILD_TIME_ZONE,
    buildTimeZoneLabel: BUILD_TIME_ZONE_LABEL,
    statusLabel,
  };
}
