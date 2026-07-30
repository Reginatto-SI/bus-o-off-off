import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OfficialSponsorsSection } from "./OfficialSponsorsSection";

describe("OfficialSponsorsSection", () => {
  it("mantém um cabeçalho institucional curto sem chamadas de captação", () => {
    render(<OfficialSponsorsSection />);

    expect(screen.getByRole("heading", { name: "Patrocinadores Oficiais SmartBus" })).toBeInTheDocument();
    expect(screen.getByText("Parceiros em destaque no ecossistema SmartBus.")).toBeInTheDocument();
    expect(screen.queryByText("Espaços comerciais oficiais")).not.toBeInTheDocument();
    expect(screen.queryByText("Destaque sua marca em uma área oficial do SmartBus.")).not.toBeInTheDocument();
  });

  it("mantém exatamente três slots na ordem 01, 02 e 03", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const mobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");

    expect(mobileCards).toHaveLength(3);
    expect(within(mobileCards[0]).getByAltText("Banner mobile de Seguro Viagem da AEG Corretora de Seguros")).toBeInTheDocument();
    expect(within(mobileCards[1]).getByAltText("Banner mobile do Patrocinador 02")).toBeInTheDocument();
    expect(within(mobileCards[2]).getByAltText("Banner mobile do Patrocinador 03")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Ver patrocinador \d/ })).toHaveLength(6);
  });

  it("acompanha a altura do slide mobile ativo", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const carousel = container.querySelector<HTMLElement>('[data-sponsor-carousel="mobile"]')!;
    const viewport = container.querySelector<HTMLElement>('[data-sponsor-carousel-viewport="mobile"]')!;
    const cards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");
    Object.defineProperty(cards[0], "offsetHeight", { configurable: true, value: 320 });
    Object.defineProperty(cards[1], "offsetHeight", { configurable: true, value: 470 });
    carousel.scrollTo = vi.fn();

    fireEvent.load(within(cards[0]).getByAltText("Banner mobile de Seguro Viagem da AEG Corretora de Seguros"));
    expect(viewport).toHaveStyle({ height: "320px" });
    expect(viewport).toHaveClass("overflow-hidden", "transition-[height]");
    expect(carousel).not.toHaveAttribute("style");
    expect(carousel).toHaveClass("overflow-x-auto", "overflow-y-hidden");

    fireEvent.click(screen.getAllByRole("button", { name: "Ver patrocinador 2" })[0]);
    expect(viewport).toHaveStyle({ height: "470px" });
  });

  it("usa o WhatsApp individual da AEG na imagem mobile, na imagem desktop e no CTA", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const firstMobileCard = container.querySelectorAll<HTMLElement>("[data-sponsor-card]")[0];
    const expectedUrl =
      "https://wa.me/553133333065?text=Ol%C3%A1!%20Gostaria%20de%20saber%20mais%20sobre%20o%20Seguro%20Viagem%20da%20AEG%20Corretora%20de%20Seguros.%20Conheci%20a%20empresa%20pela%20p%C3%A1gina%20do%20SmartBus%20BR.";

    expect(within(firstMobileCard).queryByText("Patrocinador 01")).not.toBeInTheDocument();
    expect(within(firstMobileCard).queryByText("Patrocinador oficial SmartBus BR.")).not.toBeInTheDocument();
    expect(within(firstMobileCard).getByAltText("Banner mobile de Seguro Viagem da AEG Corretora de Seguros")).toHaveAttribute("src", "/sponsors/patrocinador-01-mobile.png");
    const aegMobileLinks = within(firstMobileCard).getAllByRole("link", {
      name: "Conhecer o Seguro Viagem da AEG Corretora de Seguros",
    });
    expect(aegMobileLinks).toHaveLength(2);
    aegMobileLinks.forEach((link) => expect(link).toHaveAttribute("href", expectedUrl));
    expect(screen.getByAltText("Banner desktop de Seguro Viagem da AEG Corretora de Seguros")).toHaveAttribute("src", "/sponsors/patrocinador-01-desktop.png");
    expect(screen.getAllByRole("link", { name: "Conhecer o Seguro Viagem da AEG Corretora de Seguros" })[2]).toHaveAttribute("href", expectedUrl);
    expect(decodeURIComponent(expectedUrl)).toContain("Seguro Viagem");
    expect(decodeURIComponent(expectedUrl)).toContain("SmartBus BR");
    expect(screen.queryByRole("link", { name: /Abrir site/ })).not.toBeInTheDocument();
    expect(firstMobileCard).toHaveClass("self-start");
    expect(firstMobileCard.lastElementChild).not.toHaveClass("flex-1");
  });

  it("mantém somente o Patrocinador 02 real quando os slots 01 e 03 falharem no mobile", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const mobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");

    fireEvent.error(within(mobileCards[0]).getByAltText("Banner mobile de Seguro Viagem da AEG Corretora de Seguros"));
    fireEvent.error(within(mobileCards[2]).getByAltText("Banner mobile do Patrocinador 03"));

    const updatedMobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");
    expect(within(updatedMobileCards[0]).getAllByText("Anuncie aqui").length).toBeGreaterThan(0);
    expect(within(updatedMobileCards[0]).getByText("Sua marca pode aparecer em uma área de destaque dentro do SmartBus.")).toBeInTheDocument();
    expect(within(updatedMobileCards[0]).getByRole("link", { name: /Quero ser patrocinador/ })).toBeInTheDocument();
    expect(updatedMobileCards[0]).not.toHaveClass("self-start");
    expect(updatedMobileCards[0].lastElementChild).toHaveClass("flex-1");
    expect(within(updatedMobileCards[1]).getByAltText("Banner mobile do Patrocinador 02")).toHaveAttribute(
      "src",
      "/sponsors/patrocinador-02-mobile.png",
    );
    expect(within(updatedMobileCards[2]).getAllByText("Anuncie aqui").length).toBeGreaterThan(0);
    expect(screen.getByAltText("Banner desktop de Seguro Viagem da AEG Corretora de Seguros")).toBeInTheDocument();
  });

  it("mantém três placeholders quando todas as imagens mobile falharem", () => {
    const { container } = render(<OfficialSponsorsSection />);

    screen.getAllByAltText(/Banner mobile/).forEach((image) => fireEvent.error(image));

    const mobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");
    expect(mobileCards).toHaveLength(3);
    mobileCards.forEach((card) => expect(within(card).getAllByText("Anuncie aqui").length).toBeGreaterThan(0));
  });

  it("troca somente o viewport desktop cuja imagem falhar pelo placeholder", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const desktopImage = screen.getByAltText("Banner desktop de Seguro Viagem da AEG Corretora de Seguros");

    fireEvent.error(desktopImage);

    const desktopCarousel = container.querySelector<HTMLElement>(".lg\\:block");
    expect(desktopCarousel).not.toBeNull();
    expect(within(desktopCarousel!).getByText("Anuncie aqui")).toBeInTheDocument();
    expect(screen.getByAltText("Banner mobile de Seguro Viagem da AEG Corretora de Seguros")).toBeInTheDocument();
  });

  it("preserva o fallback SmartBus nos slots sem contato individual", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const mobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");
    const smartBusUrl = "https://wa.me/5531992074309?text=";

    [mobileCards[1], mobileCards[2]].forEach((card) => {
      within(card).getAllByRole("link").forEach((link) => {
        expect(link.getAttribute("href")).toContain(smartBusUrl);
        expect(link.getAttribute("href")).not.toContain("553133333065");
      });
    });
  });
});
