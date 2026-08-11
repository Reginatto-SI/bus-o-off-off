import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: { id: "developer-1" } as { id: string } | null,
  userRole: "developer" as string | null,
  loading: false,
}));
const viewport = vi.hoisted(() => ({ isMobile: true }));
const eruda = vi.hoisted(() => ({ init: vi.fn(), destroy: vi.fn() }));
const importGate = vi.hoisted(() => ({ pending: Promise.resolve(), release: () => {} }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.isMobile }));
vi.mock("eruda", async () => {
  await importGate.pending;
  return { default: eruda };
});

beforeEach(() => {
  vi.resetModules();
  let release!: () => void;
  importGate.pending = new Promise<void>((resolve) => { release = resolve; });
  importGate.release = release;
  authState.user = { id: "developer-1" };
  authState.userRole = "developer";
  viewport.isMobile = true;
  eruda.init.mockClear();
  eruda.destroy.mockClear();
});

afterEach(() => cleanup());

describe("MobileDeveloperConsole com import pendente", () => {
  it("mantém Eruda ativo quando enabled muda de true para false e volta a true", async () => {
    const { MobileDeveloperConsole } = await import("./MobileDeveloperConsole");
    const view = render(<MobileDeveloperConsole />);

    authState.user = null;
    authState.userRole = null;
    view.rerender(<MobileDeveloperConsole />);
    authState.user = { id: "developer-1" };
    authState.userRole = "developer";
    view.rerender(<MobileDeveloperConsole />);

    await act(async () => importGate.release());
    expect(eruda.init).toHaveBeenCalledOnce();
    expect(eruda.destroy).not.toHaveBeenCalled();
  });

  it("permanece inativo quando enabled termina false", async () => {
    const { MobileDeveloperConsole } = await import("./MobileDeveloperConsole");
    const view = render(<MobileDeveloperConsole />);
    authState.user = null;
    authState.userRole = null;
    view.rerender(<MobileDeveloperConsole />);

    await act(async () => importGate.release());
    expect(eruda.init).not.toHaveBeenCalled();
  });
});
