import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfficialSponsorsSection } from "./OfficialSponsorsSection";

describe("OfficialSponsorsSection", () => {
  it("mantém exatamente três slots na ordem 01, 02 e 03", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const mobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");

    expect(mobileCards).toHaveLength(3);
    expect(within(mobileCards[0]).getByAltText("Banner mobile do Patrocinador 01")).toBeInTheDocument();
    expect(within(mobileCards[1]).getByAltText("Banner mobile do Patrocinador 02")).toBeInTheDocument();
    expect(within(mobileCards[2]).getByAltText("Banner mobile do Patrocinador 03")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Ver patrocinador \d/ })).toHaveLength(6);
  });

  it("oculta os labels genéricos do patrocinador real e preserva sua imagem e ação", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const firstMobileCard = container.querySelectorAll<HTMLElement>("[data-sponsor-card]")[0];

    expect(within(firstMobileCard).queryByText("Patrocinador 01")).not.toBeInTheDocument();
    expect(within(firstMobileCard).queryByText("Patrocinador oficial SmartBus BR.")).not.toBeInTheDocument();
    expect(within(firstMobileCard).getByAltText("Banner mobile do Patrocinador 01")).toBeInTheDocument();
    expect(within(firstMobileCard).getByRole("link", { name: "Conhecer o Patrocinador 01" })).toHaveAttribute(
      "href",
      "https://wa.me/5531992074309?text=Ol%C3%A1!%20Quero%20conhecer%20os%20espa%C3%A7os%20de%20Patrocinadores%20Oficiais%20do%20SmartBus.",
    );
    expect(within(firstMobileCard).getByRole("link", { name: /Conhecer patrocinador/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Abrir site/ })).not.toBeInTheDocument();
  });

  it("mantém somente o Patrocinador 02 real quando os slots 01 e 03 falharem no mobile", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const mobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");

    fireEvent.error(within(mobileCards[0]).getByAltText("Banner mobile do Patrocinador 01"));
    fireEvent.error(within(mobileCards[2]).getByAltText("Banner mobile do Patrocinador 03"));

    const updatedMobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");
    expect(within(updatedMobileCards[0]).getAllByText("Anuncie aqui").length).toBeGreaterThan(0);
    expect(within(updatedMobileCards[0]).getByText("Sua marca pode aparecer em uma área de destaque dentro do SmartBus.")).toBeInTheDocument();
    expect(within(updatedMobileCards[0]).getByRole("link", { name: /Quero ser patrocinador/ })).toBeInTheDocument();
    expect(within(updatedMobileCards[1]).getByAltText("Banner mobile do Patrocinador 02")).toHaveAttribute(
      "src",
      "/sponsors/patrocinador-02-mobile.png",
    );
    expect(within(updatedMobileCards[2]).getAllByText("Anuncie aqui").length).toBeGreaterThan(0);
    expect(screen.getByAltText("Banner desktop do Patrocinador 01")).toBeInTheDocument();
  });

  it("mantém três placeholders quando todas as imagens mobile falharem", () => {
    const { container } = render(<OfficialSponsorsSection />);

    screen.getAllByAltText(/Banner mobile do Patrocinador/).forEach((image) => fireEvent.error(image));

    const mobileCards = container.querySelectorAll<HTMLElement>("[data-sponsor-card]");
    expect(mobileCards).toHaveLength(3);
    mobileCards.forEach((card) => expect(within(card).getAllByText("Anuncie aqui").length).toBeGreaterThan(0));
  });

  it("troca somente o viewport desktop cuja imagem falhar pelo placeholder", () => {
    const { container } = render(<OfficialSponsorsSection />);
    const desktopImage = screen.getByAltText("Banner desktop do Patrocinador 01");

    fireEvent.error(desktopImage);

    const desktopCarousel = container.querySelector<HTMLElement>(".lg\\:block");
    expect(desktopCarousel).not.toBeNull();
    expect(within(desktopCarousel!).getByText("Anuncie aqui")).toBeInTheDocument();
    expect(screen.getByAltText("Banner mobile do Patrocinador 01")).toBeInTheDocument();
  });
});
