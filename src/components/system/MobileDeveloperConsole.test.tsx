import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileDeveloperConsole, shouldEnableMobileDeveloperConsole } from "./MobileDeveloperConsole";

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  userRole: null as string | null,
  loading: false,
}));
const viewport = vi.hoisted(() => ({ isMobile: true }));
const eruda = vi.hoisted(() => ({ init: vi.fn(), destroy: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.isMobile }));
vi.mock("eruda", () => ({ default: eruda }));

afterEach(async () => {
  cleanup();
  authState.user = null;
  authState.userRole = null;
  authState.loading = false;
  viewport.isMobile = true;
  await Promise.resolve();
  eruda.init.mockClear();
  eruda.destroy.mockClear();
});

describe("MobileDeveloperConsole", () => {
  it.each([
    [true, "developer", true, true],
    [true, "developer", false, false],
    [true, "motorista", true, false],
    [true, "gerente", true, false],
    [false, null, true, false],
  ])("valida autenticação, role e viewport", (authenticated, userRole, isMobile, expected) => {
    expect(shouldEnableMobileDeveloperConsole({ authenticated, userRole, isMobile, loading: false })).toBe(expected);
  });

  it("carrega uma única instância para developer mobile, inclusive após rerender", async () => {
    authState.user = { id: "developer-1" };
    authState.userRole = "developer";
    const view = render(<MobileDeveloperConsole />);

    await waitFor(() => expect(eruda.init).toHaveBeenCalledOnce());
    view.rerender(<MobileDeveloperConsole />);
    expect(eruda.init).toHaveBeenCalledOnce();
  });

  it("não carrega para usuário sem role developer", async () => {
    authState.user = { id: "driver-1" };
    authState.userRole = "motorista";
    render(<MobileDeveloperConsole />);
    await Promise.resolve();
    expect(eruda.init).not.toHaveBeenCalled();
  });

  it("destrói a instância no logout", async () => {
    authState.user = { id: "developer-1" };
    authState.userRole = "developer";
    const view = render(<MobileDeveloperConsole />);
    await waitFor(() => expect(eruda.init).toHaveBeenCalledOnce());

    authState.user = null;
    authState.userRole = null;
    view.rerender(<MobileDeveloperConsole />);
    expect(eruda.destroy).toHaveBeenCalledOnce();
  });

  it("destrói a instância quando a viewport deixa de ser mobile", async () => {
    authState.user = { id: "developer-1" };
    authState.userRole = "developer";
    const view = render(<MobileDeveloperConsole />);
    await waitFor(() => expect(eruda.init).toHaveBeenCalledOnce());

    viewport.isMobile = false;
    view.rerender(<MobileDeveloperConsole />);
    expect(eruda.destroy).toHaveBeenCalledOnce();
  });
});
