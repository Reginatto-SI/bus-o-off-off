import { useState } from 'react';
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
  LayoutGrid,
  Building2,
  Star } from
'lucide-react';
import logo from '@/assets/logo.png';

// Mock controlado da landing: mantém a vitrine comercial estável mesmo sem depender do carregamento do catálogo real.
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
  reservedLabel: '126 pessoas já reservaram',
  status: 'Saída confirmada'
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
  reservedLabel: '94 pessoas já reservaram',
  status: 'Saída confirmada'
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
  reservedLabel: '148 pessoas já reservaram',
  status: 'Saída confirmada'
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
  reservedLabel: '81 pessoas já reservaram',
  status: 'Saída confirmada'
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
  reservedLabel: '67 pessoas já reservaram',
  status: 'Saída confirmada'
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
  reservedLabel: '109 pessoas já reservaram',
  status: 'Saída confirmada'
}];


const QUICK_BENEFITS = [
'Sem fila para comprar',
'QR Code para embarque',
'Pagamento online seguro'];


const PASSENGER_STEPS = [
{
  icon: Calendar,
  title: 'Escolha seu embarque com horário garantido',
  desc: 'Compare destino, data e ponto de saída em poucos segundos.'
},
{
  icon: Ticket,
  title: 'Garanta sua vaga em poucos cliques',
  desc: 'Finalize a compra online sem depender de atendimento manual.'
},
{
  icon: QrCode,
  title: 'Apresente o QR Code e embarque sem fila',
  desc: 'Receba a confirmação e valide seu acesso no momento do embarque.'
}];


const PLATFORM_DIFFERENTIALS = [
{
  icon: QrCode,
  title: 'Controle de embarque por QR Code',
  desc: 'Validação rápida para reduzir filas e evitar erros no check-in.'
},
{
  icon: Link2,
  title: 'Venda por link com comissionamento',
  desc: 'Distribua links de venda com acompanhamento de parceiros e vendedores.'
},
{
  icon: LayoutGrid,
  title: 'Gestão completa de eventos e viagens',
  desc: 'Organize saídas, passageiros e operação em uma só plataforma.'
},
{
  icon: Bus,
  title: 'Mapa de assentos por veículo',
  desc: 'Visualize ocupação, escolha lugares e planeje melhor a lotação.'
},
{
  icon: CreditCard,
  title: 'Pagamento integrado',
  desc: 'Venda online com fluxo financeiro centralizado e confirmação imediata.'
}];


const BUSINESS_BENEFITS = [
{
  icon: ClipboardCheck,
  title: 'Controle de embarque por QR Code',
  desc: 'Mais agilidade na operação e menos conferência manual na saída.'
},
{
  icon: TrendingUp,
  title: 'Venda online automatizada',
  desc: 'Publique viagens, receba online e acompanhe ocupação em tempo real.'
},
{
  icon: Users,
  title: 'Gestão de passageiros',
  desc: 'Tenha lista, assentos e histórico de compra organizados no mesmo painel.'
}];


const JOURNEY_OPTIONS = [
{
  icon: Ticket,
  title: 'Quero viajar',
  desc: 'Veja as próximas viagens, compare preços e reserve sua vaga agora.',
  cta: 'Ver viagens disponíveis',
  to: '/eventos',
  style: 'bg-background border-border hover:border-primary/30'
},
{
  icon: Building2,
  title: 'Quero vender passagens',
  desc: 'Cadastre sua empresa e comece a vender com controle, automação e escala.',
  cta: 'Quero vender passagens',
  to: '/cadastro',
  style: 'bg-primary/5 border-primary/20 hover:border-primary/40'
}];


export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="relative z-20 border-b border-white/10 bg-[hsl(222_47%_11%)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Smartbus BR" className="h-9 object-contain brightness-0 invert" />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link to="/eventos" className="text-sm font-medium text-white/72 transition-colors hover:text-white">
              Viagens
            </Link>
            <Link to="/consultar-passagens" className="text-sm font-medium text-white/72 transition-colors hover:text-white">
              Minhas Passagens
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-white/20 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors duration-200 hover:bg-slate-100">
              
              Área Administrativa
            </Link>
            <Link
              to="/cadastro"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              
              Quero vender passagens
            </Link>
          </nav>

          <button
            className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 md:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Menu">
            
            {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenu &&
        <div className="space-y-2 border-b border-white/10 bg-[hsl(222_47%_11%)] px-4 pb-4 text-white animate-fade-in md:hidden">
            <Link to="/eventos" className="block py-2 text-sm font-medium text-white/72" onClick={() => setMobileMenu(false)}>
              Viagens
            </Link>
            <Link to="/consultar-passagens" className="block py-2 text-sm font-medium text-white/72" onClick={() => setMobileMenu(false)}>
              Minhas Passagens
            </Link>
            <Link
            to="/login"
            className="block rounded-lg border border-white/20 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-900 transition-colors duration-200 hover:bg-slate-100"
            onClick={() => setMobileMenu(false)}>
            
              Área Administrativa
            </Link>
            <Link
            to="/cadastro"
            className="block rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
            onClick={() => setMobileMenu(false)}>
            
              Quero vender passagens
            </Link>
          </div>
        }
      </header>

      <section className="relative overflow-hidden bg-[hsl(222_47%_11%)]">
        <div className="absolute inset-0">
          <div className="absolute right-[-10%] top-[-20%] h-[680px] w-[680px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-[-25%] left-[-10%] h-[520px] w-[520px] rounded-full bg-primary/5 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(circle, hsl(0 0% 100%) 1px, transparent 1px)',
              backgroundSize: '32px 32px'
            }} />
          
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 lg:px-8 lg:pb-20 lg:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12">
            <div className="space-y-8">
              <div className="space-y-5">
                


                

                <div className="space-y-4">
                  <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    Compre sua passagem em minutos ou
                    <span className="text-primary"> comece a vender com mais lucro.</span>
                  </h1>
                  <p className="max-w-2xl text-lg text-white/70 sm:text-xl">
                    A Smartbus BR conecta passageiros a viagens confirmadas e ajuda empresas a vender online com embarque por QR Code.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-white/80">
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">+12 mil passageiros atendidos</div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">+45 empresas operando</div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">Pagamentos confirmados em tempo real</div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {QUICK_BENEFITS.map((benefit) =>
                  <span
                    key={benefit}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/85">
                    
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {benefit}
                    </span>
                  )}
                </div>
              </div>

              {/* Busca enxuta e orientada à conversão: mantém a primeira dobra pronta para clique imediato. */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm shadow-2xl shadow-black/20">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      type="text"
                      placeholder="Origem, destino ou evento"
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                      readOnly />
                    
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5">
                    <Calendar className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      type="text"
                      placeholder="Data da viagem"
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                      readOnly />
                    
                  </div>
                  <Link
                    to="/eventos"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                    
                    <Search className="h-4 w-4" />
                    Ver viagens disponíveis
                  </Link>
                  <Link
                    to="/cadastro"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/12">
                    
                    Quero vender passagens
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Coluna lateral reaproveita o conceito de cards flutuantes, agora com foco em prova, urgência e clareza de público. */}
            <div className="grid gap-4 lg:pl-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-5 text-white backdrop-blur-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Para quem quer viajar</p>
                    <h2 className="mt-2 text-2xl font-bold">Viagens confirmadas com compra rápida</h2>
                  </div>
                  

                  
                </div>
                <div className="space-y-3 text-sm text-white/75">
                  <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /> Reserve sem fila nem atendimento manual</div>
                  <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Pague online com segurança</div>
                  <div className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" /> Embarque com QR Code validado</div>
                </div>
              </div>

              <div className="rounded-3xl border border-primary/20 bg-primary/10 p-5 text-white backdrop-blur-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">Para empresas</p>
                    <h2 className="mt-2 text-2xl font-bold">Mais controle, menos operação manual</h2>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {BUSINESS_BENEFITS.map((benefit) =>
                  <div key={benefit.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                        <benefit.icon className="h-4 w-4 text-primary" />
                        {benefit.title}
                      </div>
                      <p className="text-sm text-white/65">{benefit.desc}</p>
                    </div>
                  )}
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
                Para empresas parceiras
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Venda suas passagens com mais controle e mais lucro
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Centralize vendas online, passageiros e embarque em uma operação mais simples. Ideal para empresas que precisam vender rápido e operar melhor.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {BUSINESS_BENEFITS.map((benefit) =>
                <div key={benefit.title} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <benefit.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">{benefit.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{benefit.desc}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-primary/15 bg-[hsl(222_47%_11%)] p-6 text-white shadow-xl shadow-primary/5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Prova inicial</p>
                  <p className="mt-3 text-3xl font-bold text-primary">+45</p>
                  <p className="mt-2 text-sm text-white/65">empresas já usam a plataforma para publicar viagens e vender online.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Resultado operacional</p>
                  <p className="mt-3 text-3xl font-bold text-primary">Menos fila</p>
                  <p className="mt-2 text-sm text-white/65">com QR Code no embarque e confirmação mais rápida para equipe e passageiro.</p>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/10 p-5">
                <p className="text-sm text-white/75">
                  Publique viagens, acompanhe ocupação e mantenha o controle da operação sem depender de planilhas soltas ou confirmações manuais.
                </p>
                <Link
                  to="/cadastro"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  
                  Quero começar a vender
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                Oportunidades com saída confirmada
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Viagens que pedem decisão rápida</h2>
              <p className="max-w-2xl text-muted-foreground">
                Cards com urgência, preço em destaque e prova social para incentivar o clique e acelerar a compra.
              </p>
            </div>
            <Link to="/eventos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Ver todas as viagens
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURED_TRIPS.map((trip) =>
            <Link
              key={trip.id}
              to="/eventos"
              className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl">
              
                <div className="relative h-52 overflow-hidden">
                  <img
                  src={trip.image}
                  alt={trip.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy" />
                
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
            )}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Como funciona para o passageiro</h2>
            <p className="mt-2 text-muted-foreground">Menos explicação, menos fricção e mais clareza até o embarque.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {PASSENGER_STEPS.map((step, index) =>
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
            )}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Diferenciais reais do Smartbus</h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Argumentos objetivos para gerar confiança em quem compra e valor em quem vende.
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {PLATFORM_DIFFERENTIALS.map((item) =>
            <div
              key={item.title}
              className="group rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md">
              
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Escolha seu caminho</h2>
            <p className="mt-2 text-muted-foreground">A landing deixa claro em segundos se você quer comprar ou vender.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {JOURNEY_OPTIONS.map((option) =>
            <div key={option.title} className={`rounded-3xl border p-6 shadow-sm transition-all duration-300 ${option.style}`}>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <option.icon className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">{option.title}</h3>
                <p className="mt-3 max-w-xl text-muted-foreground">{option.desc}</p>
                <Link
                to={option.to}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                
                  {option.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-primary/15 bg-card p-8 text-center shadow-xl sm:p-10">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Decida agora o próximo passo</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground sm:text-lg">
              Simples para comprar, seguro para pagar e fácil para operar. A landing termina com dois caminhos claros para conversão.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-4 sm:flex-row">
              <Link
                to="/eventos"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                
                Ver viagens disponíveis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/cadastro"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-8 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                
                Cadastrar minha empresa
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2"><Shield className="h-4 w-4 text-primary" /> Segurança no pagamento</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Uso simples no celular</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2"><Bus className="h-4 w-4 text-primary" /> Embarque mais organizado</span>
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
                Plataforma de transporte para eventos e excursões com foco em compra rápida e operação profissional.
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
    </div>);

}