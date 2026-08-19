import { Link } from "react-router-dom";
import { usePageMeta, useJsonLd } from "@/lib/usePageMeta";
import {
  ArrowRight,
  Bus,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Coins,
  CreditCard,
  FileSpreadsheet,
  Heart,
  MapPin,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";

import { FloatingWhatsApp } from "@/components/public/FloatingWhatsApp";
import { LandingHeader } from "@/components/public/LandingHeader";
import { TrustFooter } from "@/components/public/TrustFooter";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Página satélite SEO de caravanas, seguindo o PRD "Página SEO Sistema para Caravanas"
// e o padrão visual da página piloto /sistema-para-excursoes.

const PROBLEM_POINTS = [
  {
    icon: MessageCircle,
    title: "Lista de nomes no WhatsApp",
    description: "A caravana começa em um grupo e a lista real fica perdida entre mensagens e áudios.",
  },
  {
    icon: FileSpreadsheet,
    title: "Anotações informais",
    description: "Caderno, bloco de notas e planilha nunca batem quando alguém desiste ou troca de lugar.",
  },
  {
    icon: ClipboardList,
    title: "Confusão no embarque",
    description: "No dia da saída, conferir quem pagou e quem vai viajar vira um problema na porta do ônibus.",
  },
];

const SOLUTION_POINTS = [
  "Centralize participantes, pagamentos e embarque da caravana em um só lugar",
  "Acompanhe quem já confirmou sem depender de conferência manual",
  "Organize pontos e horários de saída com informação clara para o grupo",
  "Mantenha a simplicidade da caravana, mas com controle de verdade",
];

const BENEFITS = [
  "Controle dos participantes da caravana",
  "Organização do embarque",
  "Redução de erros e retrabalho",
  "Mais segurança para o organizador e para o grupo",
  "Mais profissionalismo na condução da viagem",
];

const HOW_IT_WORKS = [
  "Crie sua caravana",
  "Defina os embarques",
  "Organize os participantes",
  "Controle tudo em um só lugar",
];

const CARAVAN_TYPES = [
  {
    icon: Heart,
    title: "Caravanas religiosas",
    description: "Romarias e encontros com grupos recorrentes da comunidade.",
  },
  {
    icon: Ticket,
    title: "Caravanas de futebol",
    description: "Torcidas organizadas e grupos de amigos que viajam para jogos.",
  },
  {
    icon: Users,
    title: "Grupos recorrentes",
    description: "Caravanas que se repetem e precisam de histórico organizado.",
  },
  {
    icon: MapPin,
    title: "Viagens fechadas em grupo",
    description: "Saídas combinadas entre pessoas próximas, com embarque definido.",
  },
];

const DIFFERENTIAL_ITEMS = [
  "Sem mensalidade e sem custo fixo",
  "Pagamento por venda realizada",
  "Possibilidade de repassar a taxa ao participante",
  "Validação de embarque por QR Code",
];

// Interlinkagem simples entre páginas já publicadas, conforme o bloco de navegação exigido pelo PRD.
const NAV_LINKS = [
  {
    title: "Landing principal SmartBus",
    href: "/",
    description: "Veja a visão geral da plataforma e como começar",
  },
  {
    title: "Sistema para excursões",
    href: "/sistema-para-excursoes",
    description: "Organize excursões com vendas e embarque no mesmo fluxo",
  },
  {
    title: "Como organizar uma excursão",
    href: "/como-organizar-excursao",
    description: "Guia prático da organização até o dia da saída",
  },
];

const FAQ_ITEMS = [
  {
    question: "Posso usar sem CNPJ?",
    answer:
      "Você pode começar a organizar sua caravana sem travar o processo. Se precisar, nossa equipe orienta o melhor formato para o seu caso.",
  },
  {
    question: "Funciona para grupos religiosos?",
    answer:
      "Sim. Caravanas religiosas e romarias são um dos cenários mais comuns: você mantém a lista de participantes, os embarques e os pagamentos organizados.",
  },
  {
    question: "Serve para caravanas de futebol?",
    answer:
      "Sim. Para caravanas de jogos, o controle de lotação e a confirmação de quem pagou ficam centralizados até a hora da saída.",
  },
  {
    question: "Tem mensalidade?",
    answer:
      "Não. Não existe mensalidade nem custo fixo. Você paga apenas por venda realizada, com possibilidade de repasse da taxa ao participante.",
  },
  {
    question: "Como fica o embarque da caravana?",
    answer:
      "A lista de participantes fica centralizada e a validação pode ser feita por QR Code no momento da saída, sem lista em papel.",
  },
];

const TRUST_ELEMENTS = [
  {
    icon: Users,
    title: "Participantes organizados",
    description: "Lista sempre atualizada, sem depender do grupo de WhatsApp.",
  },
  {
    icon: CreditCard,
    title: "Pagamentos centralizados",
    description: "Confirmação registrada automaticamente após o pagamento.",
  },
  {
    icon: QrCode,
    title: "Embarque validado",
    description: "Conferência rápida na porta do ônibus.",
  },
  {
    icon: ShieldCheck,
    title: "Mais tranquilidade",
    description: "Menos improviso e mais previsibilidade no dia da viagem.",
  },
];

const BRAND_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "SmartBus BR",
      url: "https://www.smartbus.com.br",
      sameAs: ["https://twitter.com/SmartbusBR"],
    },
    {
      "@type": "WebSite",
      name: "SmartBus BR",
      url: "https://www.smartbus.com.br",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export default function SystemForCaravansPage() {
  usePageMeta({
    title: "Sistema para caravanas | SmartBus",
    description:
      "Sistema para organizar caravanas: controle de participantes, embarques definidos, pagamentos centralizados e validação na saída. Sem mensalidade.",
    path: "/sistema-para-caravanas",
  });
  useJsonLd("brand-caravanas", BRAND_JSONLD);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />

      <main>
        <section className="border-b border-border/60 bg-gradient-to-b from-[hsl(222_47%_11%)] via-[hsl(222_40%_14%)] to-[hsl(222_35%_16%)] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                  Organização para caravanas
                </p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
                  Sistema para organizar caravanas com mais controle e menos complicação
                </h1>
                <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
                  Gerencie participantes, organize embarques e controle pagamentos de forma simples.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="gap-2">
                    <Link to="/cadastro">
                      Começar minha caravana agora
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
                    <a href="#como-funciona">Ver como funciona</a>
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
                <p className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Sem mensalidade · pagamento por venda
                </p>
                <h2 className="mt-4 text-2xl font-bold text-white">Organize o grupo sem perder a simplicidade</h2>
                <ul className="mt-5 space-y-3 text-sm text-white/80 sm:text-base">
                  {[
                    "Link pronto para compartilhar no grupo da caravana",
                    "Lista de participantes atualizada automaticamente",
                    "Embarques com ponto e horário definidos",
                    "Possibilidade de repassar a taxa por venda ao participante",
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

        {/* Storytelling: contexto real antes da solução, conforme o modelo de conteúdo emocional. */}
        <section className="py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Toda caravana começa animada — e complica na véspera</h2>
              <p className="mt-3 max-w-3xl text-muted-foreground">
                No começo é só um grupo no WhatsApp e uma lista de nomes. Depois vêm as trocas de última hora, os
                pagamentos parciais, o participante que jurou ter confirmado e o ônibus com um lugar que ninguém sabe
                se está vago. Às vésperas da viagem, quem organiza passa a noite conferindo nomes em vez de cuidar do
                grupo.
              </p>
              <p className="mt-3 max-w-3xl text-muted-foreground">
                O ponto de virada é simples: o problema nunca foi a caravana ser informal. É a informação estar
                espalhada. Quando lista, pagamento e embarque ficam no mesmo lugar, a caravana continua próxima e
                acolhedora — só que sem improviso.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <p className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
                Problema real
              </p>
              <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">O que trava quem organiza caravana</h2>
              <div className="mt-6 space-y-3">
                {PROBLEM_POINTS.map((item) => (
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

            <article className="rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm sm:p-8">
              <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Solução SmartBus
              </p>
              <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
                Um sistema simples para conduzir a caravana do convite ao embarque
              </h2>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground sm:text-base">
                {SOLUTION_POINTS.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="bg-muted/30 py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Benefícios para o organizador da caravana</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {BENEFITS.map((item) => (
                  <div key={item} className="flex gap-2 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Como funciona o sistema para caravanas</h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                Em poucos passos, sua caravana passa a ter controle real sem virar burocracia.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {HOW_IT_WORKS.map((step, index) => (
                <div key={step} className="relative rounded-3xl border border-border bg-card p-6 shadow-sm">
                  <span className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {index === 0 && <CalendarCheck2 className="h-5 w-5" />}
                    {index === 1 && <Bus className="h-5 w-5" />}
                    {index === 2 && <Users className="h-5 w-5" />}
                    {index === 3 && <ClipboardList className="h-5 w-5" />}
                  </div>
                  <h3 className="max-w-[82%] text-lg font-bold text-foreground">{step}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted/40 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-primary/20 bg-card p-6 shadow-sm sm:p-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Coins className="h-3.5 w-3.5" />
                  Quanto custa
                </div>
                <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">Sem mensalidade: você paga por venda</h2>
                <ul className="mt-5 space-y-3 text-muted-foreground">
                  {DIFFERENTIAL_ITEMS.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <p className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
                  Comparação prática
                </p>
                <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">Grupo de WhatsApp vs sistema para caravanas</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Antes</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Lista no grupo, planilha paralela e conferência manual na hora do embarque.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Com SmartBus</p>
                    <p className="mt-2 text-sm text-foreground">
                      Link único, participantes confirmados e embarque validado no mesmo fluxo.
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/cadastro">
                  Começar minha caravana agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#como-funciona">Ver como funciona</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Funciona para diferentes tipos de caravana</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {CARAVAN_TYPES.map((type) => (
                  <div
                    key={type.title}
                    className="rounded-2xl border border-border bg-muted/30 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <type.icon className="h-4 w-4" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{type.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{type.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Perguntas frequentes</h2>
            </div>
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <Accordion type="single" collapsible defaultValue="faq-0" className="w-full">
                {FAQ_ITEMS.map((item, index) => (
                  <AccordionItem key={item.question} value={`faq-${index}`} className="border-border last:border-b-0">
                    <AccordionTrigger className="py-5 text-left text-base font-semibold text-foreground hover:no-underline">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* Bloco de navegação obrigatório: mantido simples e apenas com páginas já publicadas. */}
        <section className="bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground">Você também pode usar o sistema para:</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {NAV_LINKS.map((item) => (
                  <Link
                    key={item.title}
                    to={item.href}
                    className="group rounded-2xl border border-border bg-muted/30 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5"
                  >
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      Ver página
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-16 sm:pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-[hsl(222_47%_11%)] p-8 text-white sm:p-10">
              <div className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 right-0 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />
              <h2 className="text-3xl font-bold tracking-tight">Sua próxima caravana pode sair sem improviso</h2>
              <p className="mt-3 max-w-3xl text-white/75 sm:text-lg">
                Organize participantes, receba os pagamentos e conduza o embarque com clareza — sem mensalidade e
                pagando apenas por venda realizada.
              </p>
              <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {TRUST_ELEMENTS.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/90 backdrop-blur-sm">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-primary">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <p className="mt-2 font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-white/70">{item.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/cadastro">
                    Começar minha caravana agora
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
                  <a href="#como-funciona">Ver como funciona</a>
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
