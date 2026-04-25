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
  MessageCircle,
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
    title: "Controle manual e retrabalho",
    description: "Conferir pagamento e lista de passageiros toma tempo e aumenta erros.",
  },
];

const SOLUTION_POINTS = [
  "Centralize passageiros, pagamentos e embarque em um só lugar",
  "Venda passagens de excursão online com mais praticidade",
  "Organize pontos de embarque sem depender de anotações soltas",
  "Tenha uma operação mais profissional sem complicar sua rotina",
];


const HOW_IT_WORKS = [
  "Crie sua excursão",
  "Defina pontos de embarque",
  "Venda passagens online",
  "Controle seus passageiros até a saída",
];

const NAV_LINKS = [
  { title: "Landing principal SmartBus BR", href: "/" },
  { title: "Sistema para caravanas", href: "/sistema-para-caravanas" },
  { title: "Sistema para eventos", href: "/sistema-para-eventos" },
  { title: "Sistema para viagens", href: "/sistema-para-viagens" },
];

const FAQ_ITEMS = [
  {
    question: "Preciso de CNPJ para usar o SmartBus BR?",
    answer:
      "Você pode começar sua operação e organizar suas excursões sem travar o processo. Se precisar, nossa equipe orienta o melhor formato para o seu cenário.",
  },
  {
    question: "Tem mensalidade?",
    answer:
      "Não. O modelo é sem mensalidade e sem custo fixo. Você paga por venda realizada.",
  },
  {
    question: "Funciona para qualquer tipo de excursão?",
    answer:
      "Sim. O SmartBus BR atende excursões de turismo, shows, eventos e outras saídas em grupo que precisam de venda e controle organizado.",
  },
];

const TRUST_ELEMENTS = [
  "Sistema completo de gestão de viagens",
  "Controle total da operação",
  "Pagamento online com confirmação automática",
  "Validação de embarque com QR Code",
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
                Página piloto SEO · SmartBus BR
              </p>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
                Sistema para organizar excursões e vender passagens com facilidade
              </h1>
              <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
                Controle passageiros, organize embarques e gerencie suas excursões sem complicação.
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
                  "Controle passageiros com mais clareza",
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
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                "Vendas com link de pagamento e confirmação",
                "Validação de embarque no momento da saída",
                "Lista de passageiros atualizada em tempo real",
                "Gestão centralizada da excursão em um painel",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-muted/30 p-4 text-sm font-medium text-foreground">
                  {item}
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
              Quando a excursão cresce, planilhas e mensagens soltas deixam a operação vulnerável.
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

      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-primary/20 bg-card p-6 shadow-sm sm:p-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Coins className="h-3.5 w-3.5" />
                Cobrança transparente
              </div>
              <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">Excursões sem mensalidade e sem custo fixo</h2>
              <ul className="mt-5 space-y-3 text-muted-foreground">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>Você paga por venda realizada</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>Possibilidade de repassar a taxa ao cliente na passagem</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>Modelo pensado para começar sem travar seu caixa</span>
                </li>
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
            <h2 className="text-2xl font-bold text-foreground">Você também pode usar o sistema para:</h2>
            <p className="mt-2 text-sm text-muted-foreground">Além de excursões, você também pode usar o sistema em outros cenários:</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.title}
                  to={item.href}
                  className="group rounded-2xl border border-border bg-muted/30 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5"
                >
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Navegação do ecossistema SmartBus BR</p>
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
          <div className="rounded-3xl border border-primary/20 bg-[hsl(222_47%_11%)] p-8 text-white sm:p-10">
            <h2 className="text-3xl font-bold tracking-tight">Sua excursão pode operar com muito mais controle</h2>
            <p className="mt-3 max-w-3xl text-white/75 sm:text-lg">
              Venda passagens online, organize passageiros e conduza embarques com uma estrutura clara, moderna e sem
              custo fixo mensal, pagando apenas por venda com possibilidade de repasse da taxa.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST_ELEMENTS.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90">
                  {item}
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
