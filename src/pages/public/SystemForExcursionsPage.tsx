import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bus,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Coins,
  CreditCard,
  FileSpreadsheet,
  MapPin,
  MessageCircle,
  QrCode,
  Route,
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

const PROBLEM_POINTS = [
  {
    icon: FileSpreadsheet,
    title: "Planilhas espalhadas",
    description: "Informações em arquivos diferentes dificultam visão real da excursão.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp desorganizado",
    description: "Pedidos, confirmações e dúvidas se perdem em conversas no dia a dia.",
  },
  {
    icon: ClipboardList,
    title: "Conferência de ônibus no papel",
    description: "Fechar lotação, conferir nomes e validar embarque manualmente aumenta erros antes da saída.",
  },
];

const SOLUTION_POINTS = [
  "Centralize passageiros, pagamentos e embarque em um só lugar",
  "Use um sistema para excursões pensado para quem precisa vender excursão online",
  "Organize pontos de saída e horários sem depender de anotações soltas",
  "Controle presença no embarque com mais segurança para a equipe",
];

const HOW_IT_WORKS = [
  "Crie sua excursão",
  "Defina pontos de embarque",
  "Venda passagens online",
  "Controle seus passageiros até a saída",
];

const DIFFERENTIAL_ITEMS = [
  "Sem mensalidade para começar",
  "Pagamento integrado para vender excursão online",
  "Validação de embarque com QR Code",
  "Controle centralizado da excursão em um único painel",
];

const EXCURSION_TYPES = [
  {
    icon: CalendarCheck2,
    title: "Bate-volta para shows e festivais",
    description: "Organize saídas pontuais com embarque e confirmação centralizados.",
  },
  {
    icon: Users,
    title: "Caravanas religiosas com saída em grupo",
    description: "Mantenha lista de passageiros e comunicação da viagem no mesmo fluxo.",
  },
  {
    icon: Ticket,
    title: "Excursões para jogos e campeonatos",
    description: "Venda passagens online e acompanhe lotação antes da saída.",
  },
  {
    icon: MapPin,
    title: "Viagens de compras em grupo",
    description: "Defina pontos de saída e controle o embarque sem planilhas soltas.",
  },
];

// Descrições orientadas por cenário para aumentar clareza de valor em cada rota satélite.
const NAV_LINKS = [
  {
    title: "Landing principal SmartBus BR",
    href: "/",
    description: "Conheça a visão geral da plataforma e como começar",
  },
  {
    title: "Sistema para caravanas",
    href: "/sistema-para-caravanas",
    description: "Coordene grupos grandes com mais controle e organização",
  },
  {
    title: "Sistema para eventos",
    href: "/sistema-para-eventos",
    description: "Venda ingressos e gerencie participantes com facilidade",
  },
  {
    title: "Sistema para viagens",
    href: "/sistema-para-viagens",
    description: "Estruture sua operação com mais profissionalismo",
  },
];

const FAQ_ITEMS = [
  {
    question: "Preciso de CNPJ para usar o SmartBus BR?",
    answer:
      "Você pode começar sua operação para organizar excursões sem travar o processo. Se precisar, nossa equipe orienta o melhor formato para o seu cenário.",
  },
  {
    question: "Tem mensalidade?",
    answer:
      "Não. O modelo é sem mensalidade e sem custo fixo. Você paga por venda realizada.",
  },
  {
    question: "Como funciona o pagamento online da excursão?",
    answer:
      "Você cria o evento, compartilha o link e o sistema para excursões registra a confirmação automaticamente após o pagamento.",
  },
  {
    question: "Consigo vender excursão pelo celular?",
    answer:
      "Sim. Você pode acompanhar vendas, conferir passageiros e organizar excursões também pelo celular.",
  },
  {
    question: "Como faço o controle de passageiros no embarque da excursão?",
    answer:
      "A lista fica centralizada e a validação pode ser feita por QR Code no momento da saída, reduzindo conferência manual.",
  },
  {
    question: "O sistema serve para excursões religiosas e esportivas?",
    answer:
      "Sim. O fluxo funciona para diferentes cenários, incluindo excursões religiosas, excursões esportivas, shows e viagens em grupo.",
  },
  {
    question: "Como organizar excursão com vários pontos de saída?",
    answer:
      "Você configura os pontos de saída da excursão no cadastro e mantém tudo centralizado para comunicação com os passageiros.",
  },
  {
    question: "Dá para controlar lotação do ônibus antes do embarque?",
    answer:
      "Sim. O painel da excursão ajuda a acompanhar vendas confirmadas e lista de passageiros para validar a lotação antes da viagem.",
  },
  {
    question: "Posso repassar a taxa da venda para o cliente?",
    answer:
      "Sim. Existe possibilidade de repasse da taxa por venda, mantendo transparência no valor final da passagem.",
  },
  {
    question: "Quanto tempo levo para começar a usar?",
    answer:
      "Em poucos passos você cria a excursão, configura os pontos de embarque e já começa a vender excursão online.",
  },
];

const TRUST_ELEMENTS = [
  {
    icon: Ticket,
    title: "Sistema completo de gestão de excursões",
    description: "Venda e confirmação em um único fluxo digital.",
  },
  {
    icon: Route,
    title: "Fluxo validado na prática para operação real",
    description: "Da criação da excursão ao controle de embarque.",
  },
  {
    icon: QrCode,
    title: "Do pagamento ao embarque em um único processo",
    description: "Validação por QR Code para reduzir conferência manual.",
  },
  {
    icon: ShieldCheck,
    title: "Controle total da operação com confirmação automática",
    description: "Mais previsibilidade para lotação, saída e equipe.",
  },
];

export default function SystemForExcursionsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Substituição do header: reuso do mesmo componente da landing principal para manter visual e comportamento idênticos. */}
      <LandingHeader />

      {/* Mantemos o landmark <main> para preservar semântica/acessibilidade equivalente ao PublicLayout. */}
      <main>
        <section className="border-b border-border/60 bg-gradient-to-b from-[hsl(222_47%_11%)] via-[hsl(222_40%_14%)] to-[hsl(222_35%_16%)] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                  Gestão completa para excursões
                </p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
                  Sistema para organizar excursões e vender passagens com facilidade
                </h1>
                <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
                  O sistema para excursões da SmartBus ajuda a organizar excursões com pontos de saída, vender excursão online e manter o controle de passageiros até o embarque.
                </p>
                {/* Ajuste de CTA: troca de copy genérica por ação direta orientada a benefício. */}
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="gap-2">
                    <Link to="/cadastro">
                      Começar a vender passagens
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
                <h2 className="mt-4 text-2xl font-bold text-white">Profissionalize sua operação sem custo fixo</h2>
                <ul className="mt-5 space-y-3 text-sm text-white/80 sm:text-base">
                  {[
                    "Venda passagens online com link pronto para compartilhar",
                    "Controle de passageiros com atualização em tempo real",
                    "Organize embarques e pontos de encontro sem depender de processos manuais",
                    "Possibilidade de repassar a taxa por venda ao cliente",
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

        {/* Inclusão do bloco de autoridade logo após o HERO para reforçar que o SmartBus já opera ponta a ponta. */}
        <section className="py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Tudo isso em um sistema pronto para uso</h2>
              <p className="mt-3 max-w-3xl text-muted-foreground">
                Vendas, embarque, controle de passageiros e gestão da operação acontecem dentro da mesma plataforma,
                com fluxo contínuo para o organizador e para quem vai viajar.
              </p>
              {/* Cards com apoio visual para o piloto SEO ficar mais comercial e reaproveitável nas próximas satélites. */}
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    icon: CreditCard,
                    title: "Vendas com link de pagamento",
                    description: "Compartilhe o link e receba confirmações automáticas.",
                  },
                  {
                    icon: QrCode,
                    title: "Validação no embarque",
                    description: "Conferência rápida no momento da saída do ônibus.",
                  },
                  {
                    icon: Users,
                    title: "Lista sempre atualizada",
                    description: "Acompanhe passageiros confirmados em tempo real.",
                  },
                  {
                    icon: ClipboardList,
                    title: "Painel centralizado",
                    description: "Operação de ponta a ponta em um único lugar.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-border bg-muted/30 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <p className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
                Problema real
              </p>
              <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">Organizar excursões no improviso custa caro</h2>
              <p className="mt-3 text-muted-foreground">
                Quando a excursão cresce e envolve ônibus, horários e embarque, planilhas e mensagens soltas deixam a operação vulnerável.
              </p>
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
                Solução SmartBus BR
              </p>
              <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
                Um sistema simples para organizar excursões de ponta a ponta
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

        {/* Separação de público: dois blocos lado a lado para explicitar ofertas por perfil sem criar fluxo novo. */}
        <section className="bg-muted/30 py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-bold text-foreground">Para quem organiza excursões</h2>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground sm:text-base">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Venda e gestão em um só lugar</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Operação de embarque mais organizada</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Controle completo de passageiros</li>
                </ul>
              </article>
              <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-bold text-foreground">Para quem quer viajar</h2>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground sm:text-base">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Compra de passagem online com confirmação</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Informações claras da viagem e embarque</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Validação de embarque por QR Code</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* Compactação de conteúdo: removemos bloco redundante de benefícios para reduzir repetição e manter leitura mais objetiva. */}
        <section id="como-funciona" className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Como funciona o sistema para excursões</h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                Em poucos passos, você organiza sua excursão com uma operação mais profissional.
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
                    {index === 2 && <CreditCard className="h-5 w-5" />}
                    {index === 3 && <Users className="h-5 w-5" />}
                  </div>
                  <h3 className="max-w-[82%] text-lg font-bold text-foreground">{step}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bloco de diferencial obrigatório com os quatro pilares pedidos no PRD. */}
        <section className="bg-muted/40 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-primary/20 bg-card p-6 shadow-sm sm:p-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Coins className="h-3.5 w-3.5" />
                  Diferenciais SmartBus BR
                </div>
                <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">Sistema para excursões com vantagem prática no dia a dia</h2>
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
                <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">Controle manual vs sistema para excursões</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Antes</p>
                    <p className="mt-2 text-sm text-muted-foreground">Planilhas, controle manual de passageiros da excursão e mensagens perdidas.</p>
                  </div>
                  <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Com SmartBus BR</p>
                    <p className="mt-2 text-sm text-foreground">Venda online, link próprio, passageiros e embarque organizados no mesmo fluxo.</p>
                  </div>
                </div>
              </article>
            </div>

            {/* Ajuste de CTA no meio da página para manter consistência de intenção comercial sem novos fluxos. */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/cadastro">
                  Começar a vender passagens
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#como-funciona">Ver como funciona</a>
              </Button>
            </div>
          </div>
        </section>

        {/* Prova de autoridade sem números inventados, focada em uso real. */}
        <section className="py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
                Um sistema completo para organizar excursões de verdade
              </h2>
              <p className="mt-3 max-w-3xl text-muted-foreground">
                O SmartBus BR é um sistema real para organizar excursões com fluxo completo, do pagamento ao embarque,
                mantendo operação prática para equipes que precisam vender excursão com controle de lotação e saída.
              </p>
              <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Fluxo completo da excursão</p>
                  <div className="mt-4 space-y-2">
                    {[
                      { icon: CreditCard, label: "Pagamento confirmado" },
                      { icon: Users, label: "Passageiros centralizados" },
                      { icon: Bus, label: "Embarque validado com QR Code" },
                    ].map((step, index) => (
                      <div key={step.label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {index + 1}
                        </span>
                        <step.icon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: Ticket, title: "Gestão de vendas", description: "Acompanhe confirmações sem planilhas paralelas." },
                    { icon: MapPin, title: "Pontos de saída", description: "Organize locais e horários de embarque com clareza." },
                    { icon: QrCode, title: "Check-in digital", description: "Valide passageiros na saída sem lista em papel." },
                    { icon: ShieldCheck, title: "Controle operacional", description: "Tenha visão da lotação antes da viagem." },
                  ].map((item) => (
                    <div key={item.title} className="rounded-2xl border border-border bg-muted/30 p-4">
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bloco de cauda longa SEO com tipos de uso específicos do mesmo produto. */}
        <section className="bg-muted/30 py-12 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">O sistema funciona para diferentes tipos de excursão</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Refino visual: reaproveita padrão de card com ícone + microdescrição para evitar aparência crua. */}
                {EXCURSION_TYPES.map((type) => (
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
              {/* Mini demonstração curta para tangibilizar o fluxo real sem criar novo bloco estrutural. */}
              <p className="mt-6 text-sm text-muted-foreground sm:text-base">
                Você cria a excursão, define os pontos de saída, compartilha o link e começa a receber pagamentos automaticamente enquanto acompanha o controle de passageiros.
              </p>
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

        <section className="bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold text-foreground">Explore outras formas de usar o SmartBus</h2>
              <p className="mt-2 text-sm text-muted-foreground">Cada tipo de operação tem necessidades diferentes. Veja como o sistema se adapta a cada cenário.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              <h2 className="text-3xl font-bold tracking-tight">Sua excursão pode operar com muito mais controle</h2>
              <p className="mt-3 max-w-3xl text-white/75 sm:text-lg">
                Venda passagens online, organize passageiros e conduza embarques com uma estrutura clara, moderna e sem
                custo fixo mensal, pagando apenas por venda com possibilidade de repasse da taxa.
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
              {/* Ajuste de CTA final para reforçar a decisão com linguagem de ação direta. */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/cadastro">
                    Começar a vender passagens
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
