import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Calendar, Bus, Users, Shield, BarChart3, CreditCard, ChevronRight, Ticket, ClipboardCheck, ArrowRight, Menu, X } from 'lucide-react';
import logo from '@/assets/logo.png';

/* ─── Mock featured events ─── */
const FEATURED_EVENTS = [
  { id: '1', name: 'Universo Paralello', city: 'Pratigi - BA', date: '27 Dez', price: 89.90, image: '/assets/vitrine/Img_padrao_vitrine.png' },
  { id: '2', name: 'Réveillon Morro de SP', city: 'Morro de São Paulo - BA', date: '30 Dez', price: 120.00, image: '/assets/vitrine/Img_padrao_vitrine.png' },
  { id: '3', name: 'Carnaval Salvador 2026', city: 'Salvador - BA', date: '14 Fev', price: 75.00, image: '/assets/vitrine/Img_padrao_vitrine.png' },
  { id: '4', name: 'Festival de Verão', city: 'Ilhéus - BA', date: '20 Jan', price: 65.00, image: '/assets/vitrine/Img_padrao_vitrine.png' },
  { id: '5', name: 'Micareta Feira', city: 'Feira de Santana - BA', date: '18 Abr', price: 55.00, image: '/assets/vitrine/Img_padrao_vitrine.png' },
  { id: '6', name: 'São João de Caruaru', city: 'Caruaru - PE', date: '22 Jun', price: 95.00, image: '/assets/vitrine/Img_padrao_vitrine.png' },
];

const STEPS = [
  { icon: Search, title: 'Escolha sua viagem', desc: 'Busque por evento, cidade ou data e encontre a melhor opção.' },
  { icon: Ticket, title: 'Reserve sua passagem', desc: 'Selecione seu assento, preencha seus dados e pague online.' },
  { icon: ClipboardCheck, title: 'Embarque com segurança', desc: 'Receba seu QR Code e embarque sem complicação.' },
];

const FEATURES = [
  { icon: Users, title: 'Gestão completa de passageiros', desc: 'Controle total de quem embarca, com dados e assentos organizados.' },
  { icon: MapPin, title: 'Controle de embarque por local', desc: 'Defina múltiplos pontos de embarque com horários independentes.' },
  { icon: BarChart3, title: 'Relatórios de vendas em tempo real', desc: 'Acompanhe receita, ocupação e comissões de vendedores.' },
  { icon: Shield, title: 'Pagamento seguro e integrado', desc: 'Receba via Pix ou cartão com repasse automático.' },
];

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ═══════════ HEADER ═══════════ */}
      {/* O hero usa fundo escuro; por isso a marca fica clara aqui para manter contraste e consistência com o rodapé. */}
      <header className="relative z-20 border-b border-white/10 bg-[hsl(222_47%_11%)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Smartbus BR" className="h-9 object-contain brightness-0 invert" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/eventos" className="text-sm font-medium text-white/72 hover:text-white transition-colors">
              Viagens
            </Link>
            <Link to="/consultar-passagens" className="text-sm font-medium text-white/72 hover:text-white transition-colors">
              Minhas Passagens
            </Link>
            {/* CTA secundário: visual claro e discreto para não competir com a ação principal laranja. */}
            <Link
              to="/login"
              className="rounded-lg border border-white/20 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors duration-200 hover:bg-slate-100"
            >
              Área Administrativa
            </Link>
            <Link
              to="/cadastro"
              className="text-sm font-medium bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors"
            >
              Quero vender passagens
            </Link>
          </nav>

          {/* Mobile toggle */}
          <button
            className="md:hidden rounded-lg p-2 text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Menu"
          >
            {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="md:hidden space-y-2 border-b border-white/10 bg-[hsl(222_47%_11%)] px-4 pb-4 text-white animate-fade-in">
            <Link to="/eventos" className="block py-2 text-sm font-medium text-white/72" onClick={() => setMobileMenu(false)}>
              Viagens
            </Link>
            <Link to="/consultar-passagens" className="block py-2 text-sm font-medium text-white/72" onClick={() => setMobileMenu(false)}>
              Minhas Passagens
            </Link>
            {/* CTA secundário mobile mantém o mesmo papel visual refinado do desktop. */}
            <Link to="/login" className="block rounded-lg border border-white/20 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-900 transition-colors duration-200 hover:bg-slate-100" onClick={() => setMobileMenu(false)}>
              Área Administrativa
            </Link>
            <Link
              to="/cadastro"
              className="block text-center bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium"
              onClick={() => setMobileMenu(false)}
            >
              Quero vender passagens
            </Link>
          </div>
        )}
      </header>

      {/* ═══════════ HERO ═══════════ */}
      {/* Sticky removido intencionalmente apenas nesta landing para o topo subir junto com a rolagem. */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-[hsl(222_47%_11%)]">
          {/* Decorative shapes */}
          <div className="absolute top-[-20%] right-[-10%] w-[700px] h-[700px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-[-30%] left-[-15%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-[20%] right-[15%] w-80 h-80 rounded-full border border-primary/10" />
          <div className="absolute top-[30%] right-[20%] w-52 h-52 rounded-full border border-primary/5" />
          {/* Dotted grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle, hsl(0 0% 100%) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-14 pb-16">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left – content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                  <Bus className="h-3.5 w-3.5" /> Plataforma líder em transporte para eventos
                </span>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
                  Encontre sua viagem.{' '}
                  <span className="text-primary">Embarque sem complicação.</span>
                </h1>
                <p className="text-lg sm:text-xl text-white/60 max-w-lg">
                  Excursões, eventos e viagens organizadas em um só lugar. Escolha, pague online e embarque com QR Code.
                </p>
              </div>

              {/* Search bar */}
              <div className="bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-2xl p-2 flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center gap-2 bg-white/[0.06] rounded-xl px-4 py-3">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <input
                    type="text"
                    placeholder="Cidade ou evento..."
                    className="bg-transparent text-white placeholder:text-white/40 text-sm w-full outline-none"
                    readOnly
                  />
                </div>
                <div className="flex items-center gap-2 bg-white/[0.06] rounded-xl px-4 py-3 sm:w-40">
                  <Calendar className="h-4 w-4 text-primary shrink-0" />
                  <input
                    type="text"
                    placeholder="Quando?"
                    className="bg-transparent text-white placeholder:text-white/40 text-sm w-full outline-none"
                    readOnly
                  />
                </div>
                <Link
                  to="/eventos"
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-xl px-6 py-3 text-sm hover:bg-primary/90 transition-colors shrink-0"
                >
                  <Search className="h-4 w-4" />
                  Buscar viagens
                </Link>
              </div>

              {/* Secondary CTA */}
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-primary transition-colors group"
              >
                É empresa? Comece a vender suas passagens
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Right – visual composition */}
            <div className="hidden lg:flex items-center justify-center relative">
              {/* Floating cards as visual proof */}
              <div className="relative w-full max-w-md">
                {/* Card 1 */}
                <div className="absolute top-0 left-0 w-72 bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-2xl p-5 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                      <Bus className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Universo Paralello</p>
                      <p className="text-white/40 text-xs mt-0.5">Pratigi - BA • 27 Dez</p>
                      <p className="text-primary font-bold text-sm mt-2">R$ 89,90</p>
                    </div>
                  </div>
                </div>
                {/* Card 2 */}
                <div className="absolute top-32 right-0 w-64 bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-2xl p-5 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(142_76%_36%/0.2)] flex items-center justify-center shrink-0">
                      <ClipboardCheck className="h-5 w-5 text-[hsl(142_76%_36%)]" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Embarque confirmado</p>
                      <p className="text-white/40 text-xs">Assento 14A • QR validado</p>
                    </div>
                  </div>
                </div>
                {/* Card 3 */}
                <div className="absolute top-60 left-6 w-56 bg-white/[0.08] backdrop-blur-sm border border-white/10 rounded-2xl p-4 transform -rotate-1 hover:rotate-0 transition-transform duration-500">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <Users className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-xs">42 passageiros</p>
                      <p className="text-white/40 text-[11px]">3 veículos confirmados</p>
                    </div>
                  </div>
                </div>
                {/* Spacer */}
                <div className="h-[380px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ═══════════ FEATURED EVENTS ═══════════ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Viagens em destaque</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Ao vivo
                </span>
              </div>
              <p className="text-muted-foreground text-sm">Viagens confirmadas com embarque garantido</p>
            </div>
            <Link to="/eventos" className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ver todas <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Grid / scroll */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED_EVENTS.map((event) => (
              <Link
                key={event.id}
                to="/eventos"
                className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg hover:border-primary/20 transition-all duration-300"
              >
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={event.image}
                    alt={event.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-white text-xs font-semibold bg-black/40 backdrop-blur-sm rounded-lg px-2.5 py-1">
                    {event.date}
                  </span>
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                    {event.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.city}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">a partir de</span>
                    <span className="text-lg font-bold text-primary">
                      R$ {event.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="sm:hidden mt-6 text-center">
            <Link to="/eventos" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ver todas as viagens <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="py-20 sm:py-24 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Como funciona</h2>
            <p className="text-muted-foreground mt-2">Simples, rápido e seguro — do celular ao embarque</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={i} className="relative text-center space-y-4 group">
                {/* Number badge */}
                <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <step.icon className="h-9 w-9 text-primary" />
                </div>
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg">
                  {i + 1}
                </span>
                <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">{step.desc}</p>
                {/* Connector */}
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-10 left-[calc(50%+48px)] w-[calc(100%-96px)] border-t-2 border-dashed border-primary/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ BUSINESS BLOCK ═══════════ */}
      <section className="py-20 sm:py-24 bg-[hsl(222_47%_11%)] relative overflow-hidden">
        {/* Decorative */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left – text */}
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                Para empresas
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
                Venda suas passagens com mais controle e{' '}
                <span className="text-primary">mais lucro</span>
              </h2>
              <p className="text-white/50 text-lg">
                Gerencie eventos, frotas e embarque em uma única plataforma. Receba pagamentos automaticamente e acompanhe tudo em tempo real.
              </p>
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold rounded-xl px-6 py-3.5 text-sm hover:bg-primary/90 transition-colors"
              >
                Começar a vender
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Right – feature list */}
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Users, title: 'Controle de passageiros', desc: 'Lista completa com CPF, assento e status de embarque.' },
                { icon: ClipboardCheck, title: 'Gestão de embarque', desc: 'QR Code, check-in e controle de retorno.' },
                { icon: CreditCard, title: 'Vendas online automatizadas', desc: 'Checkout próprio com Pix e cartão de crédito.' },
                { icon: BarChart3, title: 'Pagamento integrado', desc: 'Repasse automático com relatórios financeiros.' },
              ].map((feat, i) => (
                <div
                  key={i}
                  className="bg-white/[0.05] border border-white/10 rounded-xl p-5 space-y-3 hover:bg-white/[0.08] transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <feat.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-white font-semibold text-sm">{feat.title}</h3>
                  <p className="text-white/40 text-xs leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ DIFFERENTIALS ═══════════ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Por que escolher o Smartbus?
            </h2>
            <p className="text-muted-foreground mt-2">
              Tudo que você precisa para vender e operar com segurança
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feat, i) => (
              <div
                key={i}
                className="group bg-card border border-border rounded-2xl p-6 space-y-4 hover:border-primary/30 hover:shadow-md transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                  <feat.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-bold text-foreground">{feat.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FINAL CTA ═══════════ */}
      <section className="relative py-20 sm:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Pronto para embarcar?
          </h2>
          <p className="text-muted-foreground text-lg">
            Encontre sua próxima viagem ou cadastre sua empresa e comece a vender hoje.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              to="/eventos"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-xl px-8 py-3.5 text-sm hover:bg-primary/90 transition-colors"
            >
              Ver viagens disponíveis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/cadastro"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-border font-semibold rounded-xl px-8 py-3.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              Cadastrar minha empresa
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-[hsl(222_47%_11%)] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="space-y-4 sm:col-span-2 lg:col-span-1">
              <img src={logo} alt="Smartbus BR" className="h-10 object-contain brightness-0 invert" />
              <p className="text-white/40 text-sm leading-relaxed">
                Plataforma de transporte para eventos e excursões. Simples, seguro e profissional.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Para passageiros</h4>
              <ul className="space-y-2.5">
                <li><Link to="/eventos" className="text-white/40 text-sm hover:text-white transition-colors">Buscar viagens</Link></li>
                <li><Link to="/consultar-passagens" className="text-white/40 text-sm hover:text-white transition-colors">Consultar passagens</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Para empresas</h4>
              <ul className="space-y-2.5">
                <li><Link to="/cadastro" className="text-white/40 text-sm hover:text-white transition-colors">Cadastrar empresa</Link></li>
                <li><Link to="/login" className="text-white/40 text-sm hover:text-white transition-colors">Acessar painel</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Institucional</h4>
              <ul className="space-y-2.5">
                <li><Link to="/politica-de-intermediacao" className="text-white/40 text-sm hover:text-white transition-colors">Política de intermediação</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 py-5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-xs text-white/30">
              © {new Date().getFullYear()} Smartbus BR. Todos os direitos reservados • CNPJ 59.461.123/0001-72
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
