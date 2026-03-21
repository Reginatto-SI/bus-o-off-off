import { useState } from 'react';
import { FloatingWhatsApp } from '@/components/public/FloatingWhatsApp';
import { Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  Calendar,
  Bus,
  Users,
  Shield,
  BarChart3,
  CreditCard,
  ChevronRight,
  Ticket,
  ClipboardCheck,
  ArrowRight,
  Menu,
  X,
  Clock3,
  CheckCircle2,
  TrendingUp,
  QrCode,
  Link2,
  Building2,
  Settings,
  Star,
} from 'lucide-react';
import logo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';

// Mock controlado da landing: mantém a vitrine comercial estável mesmo sem depender do carregamento do catálogo real.
// Ajuste de copy comercial: trocamos "reservaram" por mensagens de venda/vaga garantida para aumentar clareza e credibilidade.
const FEATURED_TRIPS = [
  {
    id: '1',
    name: 'Universo Paralello',
    city: 'Pratigi - BA',
    date: '27 Dez',
    price: 89.9,
    image: '/assets/vitrine/Img_padrao_vitrine.png',
    urgency: 'Últimas vagas',
    urgencyTone: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    reservedLabel: '126 passagens já vendidas',
    status: 'Saída confirmada',
  },
  {
    id: '2',
    name: 'Réveillon Morro de SP',
    city: 'Morro de São Paulo - BA',
    date: '30 Dez',
    price: 120,
    image: '/assets/vitrine/Img_padrao_vitrine.png',
    urgency: 'Quase lotado',
    urgencyTone: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
    reservedLabel: '94 pessoas já garantiram a vaga',
    status: 'Saída confirmada',
  },
  {
    id: '3',
    name: 'Carnaval Salvador 2026',
    city: 'Salvador - BA',
    date: '14 Fev',
    price: 75,
    image: '/assets/vitrine/Img_padrao_vitrine.png',
    urgency: 'Últimas vagas',
    urgencyTone: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    reservedLabel: '148 passagens já emitidas',
    status: 'Saída confirmada',
  },
  {
    id: '4',
    name: 'Festival de Verão',
    city: 'Ilhéus - BA',
    date: '20 Jan',
    price: 65,
    image: '/assets/vitrine/Img_padrao_vitrine.png',
    urgency: 'Quase lotado',
    urgencyTone: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
    reservedLabel: '81 passagens já vendidas',
    status: 'Saída confirmada',
  },
  {
    id: '5',
    name: 'Micareta Feira',
    city: 'Feira de Santana - BA',
    date: '18 Abr',
    price: 55,
    image: '/assets/vitrine/Img_padrao_vitrine.png',
    urgency: 'Últimas vagas',
    urgencyTone: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    reservedLabel: '67 pessoas já compraram',
    status: 'Saída confirmada',
  },
  {
    id: '6',
    name: 'São João de Caruaru',
    city: 'Caruaru - PE',
    date: '22 Jun',
    price: 95,
    image: '/assets/vitrine/Img_padrao_vitrine.png',
    urgency: 'Quase lotado',
    urgencyTone: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
    reservedLabel: '109 pessoas já garantiram a vaga',
    status: 'Saída confirmada',
  },
];

// Copy de apoio da dobra inicial com foco em simplicidade comercial para empresas e vendedores independentes.
const QUICK_BENEFITS = [
  'Link próprio para divulgar no WhatsApp e Instagram',
  'Venda online com pagamento integrado',
  'Embarque validado por QR Code',
];

const PASSENGER_STEPS = [
  {
    icon: Calendar,
    title: 'Escolha seu embarque com horário organizado',
    desc: 'Compare destino, data e ponto de saída em poucos segundos, com mais segurança antes da compra.',
  },
  {
    icon: Ticket,
    title: 'Compre online sem depender de atendimento manual',
    desc: 'Finalize a compra em poucos cliques e receba a confirmação na hora.',
  },
  {
    icon: QrCode,
    title: 'Apresente o QR Code e embarque com validação rápida',
    desc: 'A equipe confere presença com mais agilidade e reduz filas no embarque.',
  },
];

// Pilar comercial principal: reforça benefícios concretos da operação sem expor linguagem interna de produto.
const PLATFORM_PILLARS = [
  {
    icon: Building2,
    title: 'Vitrine profissional para vender mais',
    desc: 'Tenha página própria, link público, QR Code de divulgação e redes sociais reunidas para transformar divulgação em compra.',
  },
  {
    icon: TrendingUp,
    title: 'Venda online com mais controle',
    desc: 'Organize viagens e eventos por saída, acompanhe ocupação e facilite a compra para o passageiro sem depender de processos manuais.',
  },
  {
    icon: Users,
    title: 'Equipe comercial ou vendedores independentes',
    desc: 'Distribua links individuais, acompanhe desempenho e calcule comissão de quem vende por conta própria ou em equipe.',
  },
  {
    icon: ClipboardCheck,
    title: 'Operação real de embarque',
    desc: 'Use lista de embarque, validação de presença e app operacional para sair com mais organização e menos confusão no dia da viagem.',
  },
];

const PLATFORM_DIFFERENTIALS = [
  {
    icon: Link2,
    title: 'Link público para vender e divulgar',
    desc: 'Compartilhe sua página pronta no WhatsApp, Instagram ou indicação direta para apresentar viagens, eventos e passeios.',
  },
  {
    icon: QrCode,
    title: 'QR Code para divulgação e embarque',
    desc: 'Use o QR Code da vitrine para atrair vendas e o QR Code da passagem para validar presença.',
  },
  {
    icon: Users,
    title: 'App e comissão para vendedores',
    desc: 'Fortaleça sua equipe comercial ou seus revendedores com vendas por link individual e acompanhamento de resultados.',
  },
  {
    icon: Bus,
    title: 'App do motorista e equipe',
    desc: 'Organize a conferência no embarque com mais segurança, menos papel e menos confusão operacional.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios por evento e comissão',
    desc: 'Visualize vendas, presença, resultado por evento e comissão dos vendedores em um único sistema.',
  },
  {
    icon: CreditCard,
    title: 'Fluxo financeiro integrado',
    desc: 'A empresa opera com cobrança online e integração Asaas dentro da arquitetura atual da plataforma.',
  },
];

// Cards de posicionamento dual: a mesma base atende empresa estruturada e quem vende de forma independente.
const BUSINESS_BENEFITS = [
  {
    icon: Building2,
    title: 'Sua operação com presença digital pronta',
    desc: 'Ganhe uma vitrine profissional para divulgar eventos, passeios e viagens com link próprio e redes sociais.',
  },
  {
    icon: Users,
    title: 'Força comercial com vendedores',
    desc: 'Cadastre vendedores, acompanhe comissões e aumente o alcance da operação sem perder controle.',
  },
  {
    icon: ClipboardCheck,
    title: 'Embarque mais organizado',
    desc: 'Use lista de embarque, validação de passageiros e apoio operacional no celular da equipe.',
  },
];

// Opções finais de jornada: mantemos a estrutura existente, mas com CTAs mais comerciais.
const JOURNEY_OPTIONS = [
  {
    icon: Ticket,
    title: 'Quero comprar minha passagem',
    desc: 'Veja as próximas viagens, compare preços e garanta seu lugar com confirmação online.',
    cta: 'Comprar passagem',
    to: '/eventos',
    style: 'bg-background border-border hover:border-primary/30',
  },
  {
    icon: Building2,
    title: 'Quero vender passagens com mais organização',
    desc: 'Sirva sua empresa ou sua operação independente com link de venda, controle comercial e embarque organizado.',
    cta: 'Começar a vender',
    to: '/cadastro',
    style: 'bg-primary/5 border-primary/20 hover:border-primary/40',
  },
];

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  // CTA comercial unificado para a landing e para o botão flutuante, evitando números divergentes.
  const salesWhatsappUrl =
    buildWhatsappWaMeLink({
      phone: '(31) 99207-4309',
      message: 'Quero começar a vender passagens com o Smartbus BR',
    }) ?? 'https://wa.me/5531992074309?text=Quero%20come%C3%A7ar%20a%20vender%20passagens%20com%20o%20Smartbus%20BR';
  // O header da landing usa três níveis de hierarquia.
  // Aqui os links públicos ficam leves, com ícone e hover discreto, sem virar um bloco pesado.
  const desktopNavLinkClass =
    'h-10 gap-2 rounded-md px-3.5 text-sm font-medium text-white/90 transition-all hover:bg-white/10 hover:text-white hover:-translate-y-px';

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="relative z-20 border-b border-white/10 bg-[hsl(222_47%_11%)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Smartbus BR" className="h-9 object-contain brightness-0 invert" />
          </Link>

          <nav className="hidden items-center gap-4 md:flex">
            {/* Mantemos a navegação pública solta e com bom respiro entre itens para parecer premium. */}
            <div className="flex items-center gap-1.5">
              <Button asChild variant="ghost" className={desktopNavLinkClass}>
                <Link to="/eventos">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  <span>Viagens</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" className={desktopNavLinkClass}>
                <Link to="/consultar-passagens">
                  <Ticket className="h-4 w-4" aria-hidden="true" />
                  <span>Minhas Passagens</span>
                </Link>
              </Button>
            </div>
            <Button
              asChild
              variant="outline"
              className="h-10 gap-2 border-white/20 bg-white text-slate-900 shadow-sm transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900"
            >
              <Link to="/login">
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span>Área Administrativa</span>
              </Link>
            </Button>
            <Button asChild className="h-10 gap-2 px-5">
              <Link to="/cadastro">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span>Quero vender passagens</span>
              </Link>
            </Button>
          </nav>

          <button
            className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 md:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Menu"
          >
            {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenu && (
          <div className="animate-fade-in space-y-1 border-b border-white/10 bg-[hsl(222_47%_11%)] px-4 pb-4 text-white md:hidden">
            <Link
              to="/eventos"
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
              onClick={() => setMobileMenu(false)}
            >
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              Viagens
            </Link>
            <Link
              to="/consultar-passagens"
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
              onClick={() => setMobileMenu(false)}
            >
              <Ticket className="h-4 w-4 shrink-0 text-primary" />
              Minhas Passagens
            </Link>
            <div className="mt-2 space-y-2">
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-900 transition-colors duration-200 hover:bg-slate-100"
                onClick={() => setMobileMenu(false)}
              >
                <Settings className="h-4 w-4 shrink-0" />
                Área Administrativa
              </Link>
              <Link
                to="/cadastro"
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
                onClick={() => setMobileMenu(false)}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                Quero vender passagens
              </Link>
            </div>
          </div>
        )}
      </header>

      <section className="relative overflow-hidden bg-[hsl(222_47%_11%)]">
        <div className="absolute inset-0">
          <div className="absolute right-[-10%] top-[-20%] h-[680px] w-[680px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-[-25%] left-[-10%] h-[520px] w-[520px] rounded-full bg-primary/5 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(circle, hsl(0 0% 100%) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 lg:px-8 lg:pb-20 lg:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12">
            <div className="space-y-8">
              <div className="space-y-5">
                {/* Reforço de posicionamento: o hero agora vende o Smartbus BR como solução para empresas,
                    sem perder o caminho rápido do passageiro que já chega pronto para comprar. */}
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/75">
                  <Star className="h-3.5 w-3.5 text-primary" />
                  Venda, divulgação e embarque em uma só plataforma
                </div>

                <div className="space-y-4">
                  <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    Venda passagens online, divulgue seus eventos e organize o embarque
                    <span className="text-primary"> com uma operação simples, profissional e pronta para crescer.</span>
                  </h1>
                  <p className="max-w-3xl text-lg text-white/70 sm:text-xl">
                    O Smartbus BR ajuda empresas e vendedores independentes a vender mais, compartilhar link próprio,
                    acompanhar resultados e garantir um embarque mais organizado sem estrutura complexa.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-white/80">
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">Venda online e embarque no mesmo fluxo</div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">Serve para empresas e para quem vende por conta própria</div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">Mais controle para crescer sem complicação</div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {QUICK_BENEFITS.map((benefit) => (
                    <span
                      key={benefit}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/85"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {benefit}
                    </span>
                  ))}
                </div>
              </div>

              {/* Busca enxuta e orientada à conversão: mantém a primeira dobra pronta para clique imediato. */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/20 backdrop-blur-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      type="text"
                      placeholder="Origem, destino ou evento"
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                      readOnly
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5">
                    <Calendar className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      type="text"
                      placeholder="Data da viagem"
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                      readOnly
                    />
                  </div>
                  <Link
                    to="/eventos"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Search className="h-4 w-4" />
                    Comprar passagens agora
                  </Link>
                </div>
              </div>
            </div>

            {/* Coluna lateral reaproveita os cards flutuantes para deixar claros os dois públicos,
                mas agora priorizando o valor comercial que a empresa ganha ao entrar na plataforma. */}
            <div className="grid gap-4 lg:pl-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-5 text-white backdrop-blur-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Para quem quer viajar</p>
                    <h2 className="mt-2 text-2xl font-bold">Compra simples, confirmação rápida e embarque sem fila</h2>
                  </div>
                </div>
                <div className="space-y-3 text-sm text-white/75">
                  <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /> Compre online sem depender de atendimento manual</div>
                  <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Pague com segurança e receba confirmação na hora</div>
                  <div className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" /> Embarque com QR Code validado pela equipe</div>
                </div>
              </div>

              <div className="rounded-3xl border border-primary/20 bg-primary/10 p-5 text-white backdrop-blur-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">Para empresas e vendedores independentes</p>
                    <h2 className="mt-2 text-2xl font-bold">Uma estrutura simples para vender, divulgar e operar melhor</h2>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {BUSINESS_BENEFITS.map((benefit) => (
                    <div key={benefit.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                        <benefit.icon className="h-4 w-4 text-primary" />
                        {benefit.title}
                      </div>
                      <p className="text-sm text-white/65">{benefit.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Building2 className="h-3.5 w-3.5" />
                Para empresas, organizadores, revendedores e vendedores independentes
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Feito para quem precisa vender passagens com mais presença digital e operação profissional
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                O Smartbus BR foi pensado para empresas que precisam divulgar saídas, acompanhar vendedores,
                controlar embarques e visualizar resultados por evento — e também para quem vende por conta própria e quer mais organização para crescer.
              </p>
              {/* Nova hierarquia de valor: a seção apresenta os quatro pilares do produto usando os mesmos cards da landing. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {PLATFORM_PILLARS.map((benefit) => (
                  <div key={benefit.title} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <benefit.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">{benefit.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{benefit.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-primary/15 bg-[hsl(222_47%_11%)] p-6 text-white shadow-xl shadow-primary/5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Vitrine própria</p>
                  <p className="mt-3 text-3xl font-bold text-primary">Link + QR Code</p>
                  <p className="mt-2 text-sm text-white/65">para divulgar sua empresa, publicar viagens e centralizar redes sociais em uma página profissional.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Resultado operacional</p>
                  <p className="mt-3 text-3xl font-bold text-primary">Menos confusão</p>
                  <p className="mt-2 text-sm text-white/65">com lista de embarque, controle de presença e validação rápida para equipe e passageiro.</p>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/10 p-5">
                <p className="text-sm text-white/75">
                  Da divulgação ao embarque, a empresa ganha uma estrutura mais organizada para vender, operar e acompanhar o que realmente está acontecendo em cada evento.
                </p>
                <Link
                  to="/cadastro"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Quero vender com mais controle
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>


      <section className="bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Users className="h-3.5 w-3.5" />
              Posicionamento comercial claro para os dois públicos principais
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Serve para sua empresa e também para quem vende passagens por conta própria</h2>
            <p className="mt-3 text-muted-foreground sm:text-lg">
              {/* Ajuste estratégico de copy: deixamos explícita a dualidade empresa + autônomo sem criar nova arquitetura visual. */}
              Seja para profissionalizar uma operação completa ou começar com um link de venda no celular, o Smartbus BR ajuda a divulgar melhor, vender com mais controle e garantir um embarque mais organizado.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">Empresas</p>
              <h3 className="mt-3 text-2xl font-bold text-foreground">Mais estrutura para vender, operar e acompanhar resultados</h3>
              <p className="mt-3 text-muted-foreground">Organize equipe comercial, acompanhe saídas, valide embarque e centralize relatórios em um fluxo mais profissional.</p>
              <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Controle da operação e dos vendedores no mesmo lugar</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Embarque mais organizado, com menos papel e menos confusão</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Presença digital pronta para divulgar viagens e eventos</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">Vendedores independentes</p>
              <h3 className="mt-3 text-2xl font-bold text-foreground">Mais praticidade para vender pelo link e se apresentar com profissionalismo</h3>
              <p className="mt-3 text-muted-foreground">Ideal para quem vende por WhatsApp, Instagram, indicação direta ou excursão própria e quer sair do improviso sem complicação.</p>
              <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Link de venda para compartilhar com clientes no celular</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Mais controle das passagens vendidas e dos lugares confirmados</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Serve para quem está começando e para quem já quer crescer organizado</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                Eventos e viagens com saída confirmada
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">A experiência de compra continua simples para o passageiro</h2>
              <p className="max-w-2xl text-muted-foreground">
                A mesma estrutura que fortalece a empresa também ajuda o passageiro a decidir rápido, confiar na compra e chegar mais preparado ao embarque.
              </p>
            </div>
            <Link to="/eventos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Ver todas as viagens
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURED_TRIPS.map((trip) => (
              <Link
                key={trip.id}
                to="/eventos"
                className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
              >
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={trip.image}
                    alt={trip.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${trip.urgencyTone}`}>
                      {trip.urgency}
                    </span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-100">
                      {trip.status}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">A partir de</p>
                      <p className="text-3xl font-extrabold text-white">R$ {trip.price.toFixed(2).replace('.', ',')}</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">{trip.date}</span>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <h3 className="text-xl font-bold text-foreground transition-colors group-hover:text-primary">{trip.name}</h3>
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{trip.city}</span>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-2xl bg-muted/60 p-3 text-sm text-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span>{trip.reservedLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>Pagamento online e confirmação imediata</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">Embarque sem fila com QR Code</div>
                    <span className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
                      Ver detalhes
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Como o Smartbus BR ajuda a vender mais e embarcar com menos confusão</h2>
            <p className="mt-2 text-muted-foreground">Uma jornada clara para divulgar melhor, vender com mais controle e validar o embarque com segurança.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {PASSENGER_STEPS.map((step, index) => (
              <div key={step.title} className="relative rounded-3xl border border-border bg-card p-6 shadow-sm">
                <span className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Diferenciais que mostram a força real do produto</h2>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Transforme sua divulgação em vendas, acompanhe sua operação com mais clareza e leve mais organização para o embarque de cada evento.
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {PLATFORM_DIFFERENTIALS.map((item) => (
              <div
                key={item.title}
                className="group rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Escolha como você quer usar o Smartbus BR</h2>
            <p className="mt-2 text-muted-foreground">Em poucos segundos, fica claro se você quer comprar sua passagem ou começar a vender com mais organização.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {JOURNEY_OPTIONS.map((option) => (
              <div key={option.title} className={`rounded-3xl border p-6 shadow-sm transition-all duration-300 ${option.style}`}>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <option.icon className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">{option.title}</h3>
                <p className="mt-3 max-w-xl text-muted-foreground">{option.desc}</p>
                <Link
                  to={option.to}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {option.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-primary/15 bg-card p-8 text-center shadow-xl sm:p-10">
            {/* CTA final reforçado para conversão B2B sem remover a alternativa do passageiro. */}
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Comece a vender passagens com mais organização, presença digital e controle</h2>
            <p className="mx-auto mt-3 max-w-3xl text-muted-foreground sm:text-lg">
              {/* CTA final com menos objeção: reforça facilidade para empresa e autônomo sem prometer funcionalidades novas. */}
              Com o Smartbus BR, sua empresa ou operação independente pode divulgar melhor, vender online, acompanhar resultados e organizar o embarque sem depender de uma estrutura complexa.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-4 sm:flex-row">
              <Link
                to="/cadastro"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Começar a vender
                <ArrowRight className="h-4 w-4" />
              </Link>
              {/* CTA de apoio com WhatsApp atualizado para contato comercial direto sem criar novo componente. */}
              <a
                href={salesWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-8 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Falar com a equipe
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2"><Building2 className="h-4 w-4 text-primary" /> Link de venda e vitrine profissional</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2"><Users className="h-4 w-4 text-primary" /> Funciona para equipe comercial e vendedor independente</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2"><Bus className="h-4 w-4 text-primary" /> Lista de embarque e validação no celular</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-[hsl(222_47%_11%)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4 sm:col-span-2 lg:col-span-1">
              <img src={logo} alt="Smartbus BR" className="h-10 object-contain brightness-0 invert" />
              <p className="text-sm leading-relaxed text-white/40">
                Plataforma para empresas de viagens, eventos e excursões venderem, divulgarem e operarem com mais controle.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Para passageiros</h4>
              <ul className="space-y-2.5">
                <li><Link to="/eventos" className="text-sm text-white/40 transition-colors hover:text-white">Buscar viagens</Link></li>
                <li><Link to="/consultar-passagens" className="text-sm text-white/40 transition-colors hover:text-white">Consultar passagens</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Para empresas</h4>
              <ul className="space-y-2.5">
                <li><Link to="/cadastro" className="text-sm text-white/40 transition-colors hover:text-white">Cadastrar empresa</Link></li>
                <li><Link to="/login" className="text-sm text-white/40 transition-colors hover:text-white">Acessar painel</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Institucional</h4>
              <ul className="space-y-2.5">
                <li><Link to="/politica-de-intermediacao" className="text-sm text-white/40 transition-colors hover:text-white">Política de intermediação</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 py-5">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="text-center text-xs text-white/30">
              © {new Date().getFullYear()} Smartbus BR. Todos os direitos reservados • CNPJ 59.461.123/0001-72
            </p>
          </div>
        </div>
      </footer>
      <FloatingWhatsApp />
    </div>
  );
}
