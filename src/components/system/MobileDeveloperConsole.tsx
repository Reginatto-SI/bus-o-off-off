import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

type ErudaInstance = typeof import("eruda")["default"];

let activeEruda: ErudaInstance | null = null;
let activationPromise: Promise<void> | null = null;
let shouldBeActive = false;

export function shouldEnableMobileDeveloperConsole({
  authenticated,
  userRole,
  isMobile,
  loading,
}: {
  authenticated: boolean;
  userRole: string | null;
  isMobile: boolean;
  loading: boolean;
}) {
  return !loading && authenticated && userRole === "developer" && isMobile;
}

function activateEruda() {
  if (activeEruda || activationPromise) return activationPromise;

  // O import dinâmico mantém o console fora do bundle carregado por usuários comuns.
  activationPromise = import("eruda")
    .then(({ default: eruda }) => {
      // A intenção atual prevalece caso enabled tenha mudado enquanto o import estava pendente.
      if (!shouldBeActive || activeEruda) return;
      eruda.init();
      activeEruda = eruda;
    })
    .finally(() => {
      activationPromise = null;
    });

  return activationPromise;
}

function deactivateEruda() {
  activeEruda?.destroy();
  activeEruda = null;
}

export function MobileDeveloperConsole() {
  const { user, userRole, loading } = useAuth();
  const isMobile = useIsMobile();
  const enabled = shouldEnableMobileDeveloperConsole({
    authenticated: Boolean(user),
    userRole,
    isMobile,
    loading,
  });

  useEffect(() => {
    shouldBeActive = enabled;

    if (!enabled) {
      deactivateEruda();
      return;
    }

    void activateEruda();

    return () => {
      // Desmontagem ou mudança de permissão invalida a intenção desta ativação.
      shouldBeActive = false;
      deactivateEruda();
    };
  }, [enabled]);

  return null;
}
