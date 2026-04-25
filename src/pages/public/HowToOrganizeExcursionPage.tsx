import { Link } from "react-router-dom";
import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  CheckCircle2,
  CreditCard,
  ListChecks,
  MapPinned,
  MessageCircleWarning,
  Route,
  Users,
} from "lucide-react";

import { FloatingWhatsApp } from "@/components/public/FloatingWhatsApp";
import { LandingHeader } from "@/components/public/LandingHeader";
import { TrustFooter } from "@/components/public/TrustFooter";
import { Button } from "@/components/ui/button";

const STEP_BY_STEP = [
  {
    icon: MapPinned,
    title: "Definir destino",
    description:
      "Você define data, rota e pontos de parada, mas qualquer ajuste de última hora muda custo, lotação e toda a comunicação com o grupo.",
  },
  {
    icon: Users,
    title: "Organizar passageiros",
    description:
      "Quando você concentra nomes, telefones e confirmações em conversas soltas, fica fácil duplicar passageiro ou perder informação importante no embarque.",
  },
  {
    icon: CreditCard,
    title: "Controlar pagamentos",
    description:
      "Se uma pessoa paga no PIX, outra no dinheiro e outra promete pagar depois, você acaba virando cobrador e conferente ao mesmo tempo.",
  },
  {
    icon: Bus,
    title: "Gerenciar embarque",
    description:
      "No dia da viagem, você precisa conferir quem chegou, quem faltou e quem ainda está pendente; sem lista centralizada, o atraso vem rápido.",
  },
  {
    icon: AlertTriangle,
    title: "Evitar erros e atrasos",
    description:
      "Um nome errado, uma cobrança não conferida ou uma informação perdida pode gerar discussão no ônibus e desgastar sua organização.",
  },
];

const PAIN_POINTS = [
  {
    icon: MessageCircleWarning,
    title: "Lista no WhatsApp",
    description: "Mensagens se misturam e ninguém sabe qual é a versão final da lista.",
  },
  {
    icon: ListChecks,
    title: "Controle em papel",
    description: "Anotações manuais dificultam atualização rápida quando há troca de passageiros.",
  },
  {
    icon: CreditCard,
    title: "Pessoas que não pagam",
    description: "Sem controle claro de cobrança, o organizador assume risco financeiro sem perceber.",
  },
  {
    icon: Route,
    title: "Erros de embarque",
    description: "Sem conferência organizada, faltam informações críticas no momento da saída.",
  },
];

const CLUSTER_LINKS = [
  {
    title: "Controle de passageiros para excursão",
    href: "/controle-de-passageiros-excursao",
    description: "Veja como manter lista e presença organizadas.",
    available: false,
  },
  {
    title: "Como gerenciar excursões",
    href: "/como-gerenciar-excursoes",
    description: "Aprenda a estruturar a operação do dia a dia.",
    available: false,
  },
  {
    title: "Sistema gratuito para excursões",
    href: "/sistema-gratuito-para-excursoes",
    description: "Entenda como começar sem custo fixo mensal.",
    available: false,
  },
  {
    title: "Sistema para excursões (página principal)",
    href: "/sistema-para-excursoes",
    description: "Conheça o fluxo completo com mais profundidade.",
    available: true,
  },
  {
    title: "Sistema para caravanas",
    href: "/sistema-para-caravanas",
    description: "Explore um cenário próximo para operações em grupo.",
    available: false,
  },
];

export default function HowToOrganizeExcursionPage() {
  useEffect(() => {
    // SEO básico por rota pública: mantém título/meta/canonical/OG específicos desta página sem alterar arquitetura global.
    const pageTitle = "Como organizar uma excursão do zero | SmartBus BR";
    const pageDescription =
      "Aprenda como organizar uma excursão do zero com controle de passageiros, pagamentos e embarque, e veja como simplificar essa operação com o SmartBus BR.";
    const canonicalUrl = "https://www.smartbusbr.com.br/como-organizar-excursao";

    const previousTitle = document.title;
    document.title = pageTitle;

    const upsertMeta = (key: "name" | "property", value: string, content: string) => {
      let element = document.head.querySelector(`meta[${key}="${value}"]`) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(key, value);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    let canonicalElement = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalElement) {
      canonicalElement = document.createElement("link");
      canonicalElement.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalElement);
    }
    canonicalElement.setAttribute("href", canonicalUrl);

    upsertMeta("name", "description", pageDescription);
    upsertMeta("property", "og:title", pageTitle);
    upsertMeta("property", "og:description", pageDescription);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonicalUrl);

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />

      <main>
        {/* HERO: mantém mesma linguagem visual da página piloto, com CTA leve de descoberta. */}
        <section className="border-b border-border/60 bg-gradient-to-b from-[hsl(222_47%_11%)] via-[hsl(222_40%_14%)] to-[hsl(222_35%_16%)] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                  Guia prático para quem está começando
                </p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
                  Como organizar uma excursão do zero
                </h1>
                <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
                  Organizar excursão vai muito além de fechar ônibus: você precisa alinhar passageiros, pagamentos,
                  lista e comunicação sem deixar a operação escapar da sua mão.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="gap-2">
                    <Link to="/sistema-para-excursoes">
                      Ver como simplificar isso
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
                <h2 className="text-2xl font-bold text-white">Antes de vender, organize o básico com clareza</h2>
                <ul className="mt-5 space-y-3 text-sm text-white/80 sm:text-base">
                  {[
                    "Destino e logística bem definidos",
                    "Lista de passageiros atualizada",
                    "Pagamentos acompanhados sem confusão",
                    "Embarque mais previsível no dia da saída",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Storytelling obrigatório: cenário real para o visitante se reconhecer antes dos blocos educativos. */}
        <section className="py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <p className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
                Cena comum de quem organiza excursão
              </p>
              <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
                Você abre o WhatsApp e já começa o caos do dia
              </h2>
              <p className="mt-3 max-w-4xl text-muted-foreground">
                Você cria o grupo, as confirmações começam a chegar e, em poucas horas, a conversa vira uma mistura de
                “me coloca na lista”, “pago amanhã”, comprovante perdido e mudança de lugar. Na véspera da viagem, você
                tenta fechar quem realmente pagou. No dia da saída, alguém jura que já transferiu, outro aparece com
                nome que não está anotado e você precisa resolver tudo com o ônibus pronto para sair.
              </p>
            </div>
          </div>
        </section>

        {/* Introdução do problema real: contextualiza por que o processo manual fica instável. */}
        <section className="py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Por que organizar excursão parece fácil, mas não é</h2>
              <p className="mt-3 max-w-4xl text-muted-foreground">
                No começo, parece só juntar pessoas e definir destino. Na prática, você precisa acompanhar quem
                confirmou, quem pagou, quem desistiu e quem embarca em cada ponto. Quando tudo isso fica no improviso,
                você perde tempo apagando incêndio em vez de organizar a viagem.
              </p>
            </div>
          </div>
        </section>

        {/* Passo a passo obrigatório: cada card evidencia dificuldade operacional real. */}
        <section className="bg-muted/30 py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Passo a passo para organizar a excursão</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {STEP_BY_STEP.map((step, index) => (
                <article key={step.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <step.icon className="h-4 w-4" />
                    </div>
                    <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Bloco de dor crítico: traduz problemas reais de operação manual. */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <p className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
                  Dores mais comuns
                </p>
                <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">Onde a maioria dos organizadores sofre</h2>
                <div className="mt-5 space-y-3">
                  {PAIN_POINTS.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-border bg-muted/40 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <item.icon className="h-4 w-4 text-primary" />
                        {item.title}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  ))}
                </div>
              </article>

              {/* Transição + solução SmartBus: abordagem educativa, sem tom agressivo de venda. */}
              <article className="rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm sm:p-8">
                <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Transição para organização profissional
                </p>
                {/* Insight obrigatório: virada de percepção antes de apresentar o SmartBus como solução. */}
                <div className="mt-4 rounded-2xl border border-primary/25 bg-background/70 p-4">
                  <p className="text-sm font-semibold text-foreground sm:text-base">
                    O problema não é organizar excursão, é tentar fazer tudo manualmente.
                  </p>
                </div>
                <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
                  É aqui que a maioria se perde — e onde um sistema começa a fazer diferença
                </h2>
                <p className="mt-4 text-sm text-muted-foreground sm:text-base">
                  Quando sua excursão cresce, controlar tudo no braço consome energia e aumenta erro. Com o SmartBus,
                  você acompanha pagamentos, lista de passageiros, embarque e comunicação em um único fluxo, sem
                  depender de prints, caderno e conferência improvisada.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="gap-2">
                    <Link to="/sistema-para-excursoes">
                      Ver sistema completo
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Interlinkagem SEO: conecta cluster de excursões + hub principal + cluster relacionado. */}
        <section className="bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground">Continue aprendendo e aprofundando a organização da sua excursão</h2>
              <p className="mt-2 text-sm text-muted-foreground">Escolha o próximo conteúdo conforme sua etapa de decisão.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {CLUSTER_LINKS.map((item) => (
                  <Link
                    key={item.title}
                    to={item.available ? item.href : "/sistema-para-excursoes"}
                    className="group rounded-2xl border border-border bg-muted/30 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5"
                  >
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    {!item.available && (
                      <p className="mt-1 text-[11px] font-medium text-amber-600">
                        Conteúdo em breve — redirecionando para a página principal do cluster.
                      </p>
                    )}
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      Acessar página
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA final obrigatório com direcionamento para a página hub do cluster de excursões. */}
        <section className="pb-16 sm:pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-[hsl(222_47%_11%)] p-8 text-white sm:p-10">
              <div className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 right-0 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />
              <h2 className="text-3xl font-bold tracking-tight">Pronto para organizar com menos risco e mais controle?</h2>
              <p className="mt-3 max-w-3xl text-white/75 sm:text-lg">
                Veja como funciona o sistema completo para excursões e transforme um processo manual em uma operação
                mais simples no dia a dia.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/sistema-para-excursoes">
                    Veja como funciona o sistema completo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <TrustFooter />
      <FloatingWhatsApp />
    </div>
  );
}
