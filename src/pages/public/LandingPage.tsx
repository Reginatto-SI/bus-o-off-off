import { FormEvent, useMemo, useRef, useState } from "react";
import { FloatingWhatsApp } from "@/components/public/FloatingWhatsApp";
import { Link } from "react-router-dom";
import {
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
  MessageCircleMore,
  Gift,
  Wallet,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildWhatsappWaMeLink } from "@/lib/whatsapp";
// Mock controlado da landing: mantém a vitrine comercial estável mesmo sem depender do carregamento do catálogo real.
// Ajuste de UX: usamos nomes atemporais e status de data genéricos para evitar percepção de desatualização na vitrine pública.
// Ajuste de copy comercial: trocamos "reservaram" por mensagens de venda/vaga garantida para aumentar clareza e credibilidade.
// Associação semântica, explícita e exclusiva de imagens por evento: elimina repetição visual entre cards diferentes.
const FEATURED_TRIPS = [
  {
    id: "1",
    name: "Excursão para Pratigi",
    city: "Pratigi - BA",
    date: "Saída em breve",
    price: 89.9,
    image: "/landingpage/eventos_img/pratigi.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "126 passagens já vendidas",
    status: "Saída confirmada",
  },
  {
    id: "2",
    name: "Viagem para Morro de São Paulo",
    city: "Morro de São Paulo - BA",
    date: "Saída em breve",
    price: 120,
    image: "/landingpage/eventos_img/morro-sao-paulo.jpg",
    urgency: "Quase lotado",
    urgencyTone: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    reservedLabel: "94 pessoas já garantiram a vaga",
    status: "Saída confirmada",
  },
  {
    id: "3",
    name: "Show em Goiânia – Turnê Nacional",
    city: "Goiânia - GO",
    date: "Saída em breve",
    price: 135,
    image: "/landingpage/eventos_img/show-goiania.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "210 ingressos emitidos",
    status: "Saída confirmada",
  },
  {
    id: "4",
    name: "Excursão para Chapada dos Guimarães",
    city: "Chapada dos Guimarães - MT",
    date: "Saída em breve",
    price: 165,
    image: "/landingpage/eventos_img/chapada-guimaraes.jpg",
    urgency: "Quase lotado",
    urgencyTone: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    reservedLabel: "52 aventureiros confirmados",
    status: "Saída confirmada",
  },
  {
    id: "5",
    name: "Romaria para Aparecida do Norte",
    city: "Aparecida - SP",
    date: "Saída em breve",
    price: 95,
    image: "/landingpage/eventos_img/romaria-aparecida.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "187 peregrinos confirmados",
    status: "Saída confirmada",
  },
  {
    id: "6",
    name: "Excursão para Salvador",
    city: "Salvador - BA",
    date: "Saída em breve",
    price: 75,
    image: "/landingpage/eventos_img/salvador.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "148 passagens já emitidas",
    status: "Saída confirmada",
  },
  {
    id: "7",
    name: "Festival de Verão em Ilhéus",
    city: "Ilhéus - BA",
    date: "Saída em breve",
    price: 65,
    image: "/landingpage/eventos_img/evento-praia.jpg",
    urgency: "Quase lotado",
    urgencyTone: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    reservedLabel: "81 passagens já vendidas",
    status: "Saída confirmada",
  },
  {
    id: "8",
    name: "Turismo Histórico em Ouro Preto",
    city: "Ouro Preto - MG",
    date: "Saída em breve",
    price: 110,
    image: "/landingpage/eventos_img/ouro-preto.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "73 viajantes confirmados",
    status: "Saída confirmada",
  },
  {
    id: "9",
    name: "Bate-volta para Bonito",
    city: "Bonito - MS",
    date: "Saída em breve",
    price: 180,
    image: "/landingpage/eventos_img/bonito-ms.jpg",
    urgency: "Quase lotado",
    urgencyTone: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    reservedLabel: "44 reservas confirmadas",
    status: "Saída confirmada",
  },
  {
    id: "10",
    name: "Festa Noturna – Edição Especial",
    city: "Cuiabá - MT",
    date: "Saída em breve",
    price: 55,
    image: "/landingpage/eventos_img/balada-noturna.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "132 ingressos vendidos",
    status: "Saída confirmada",
  },
  {
    id: "11",
    name: "Rodeio Regional – Feira de Santana",
    city: "Feira de Santana - BA",
    date: "Saída em breve",
    price: 55,
    image: "/landingpage/eventos_img/evento-regional.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "67 pessoas já compraram",
    status: "Saída confirmada",
  },
  {
    id: "12",
    name: "Excursão para Porto Seguro",
    city: "Porto Seguro - BA",
    date: "Saída em breve",
    price: 145,
    image: "/landingpage/eventos_img/porto-seguro.jpg",
    urgency: "Quase lotado",
    urgencyTone: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    reservedLabel: "98 passageiros confirmados",
    status: "Saída confirmada",
  },
  {
    id: "13",
    name: "São João de Caruaru",
    city: "Caruaru - PE",
    date: "Saída em breve",
    price: 85,
    image: "/landingpage/eventos_img/sao-joao.jpg",
    urgency: "Quase lotado",
    urgencyTone: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    reservedLabel: "156 pessoas já garantiram a vaga",
    status: "Saída confirmada",
  },
  {
    id: "14",
    name: "Viagem para Gramado",
    city: "Gramado - RS",
    date: "Saída em breve",
    price: 175,
    image: "/landingpage/eventos_img/gramado.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "61 viajantes confirmados",
    status: "Saída confirmada",
  },
  {
    id: "15",
    name: "Festival Gastronômico",
    city: "Florianópolis - SC",
    date: "Saída em breve",
    price: 48,
    image: "/landingpage/eventos_img/festival-gastronomico.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "89 pessoas já compraram",
    status: "Saída confirmada",
  },
  {
    id: "16",
    name: "Excursão Floripa – Praias do Sul",
    city: "Florianópolis - SC",
    date: "Saída em breve",
    price: 155,
    image: "/landingpage/eventos_img/florianopolis.jpg",
    urgency: "Quase lotado",
    urgencyTone: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    reservedLabel: "109 pessoas já garantiram a vaga",
    status: "Saída confirmada",
  },
  {
    id: "17",
    name: "Festival Cultural do Recôncavo",
    city: "Cachoeira - BA",
    date: "Saída em breve",
    price: 60,
    image: "/landingpage/eventos_img/festival-cultural.jpg",
    urgency: "Últimas vagas",
    urgencyTone: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    reservedLabel: "74 ingressos emitidos",
    status: "Saída confirmada",
  },
];
// Copy de apoio da dobra inicial com foco em simplicidade comercial para empresas e vendedores independentes.
const QUICK_BENEFITS = [
  "Link próprio para divulgar no WhatsApp e Instagram",
  "Venda online com pagamento integrado",
  "Embarque validado por QR Code",
];
// Reforço comercial de preço: deixa explícito no topo que o Smartbus reduz barreira de entrada,
// o que ajuda conversão ao comunicar risco quase zero logo na primeira dobra.
const PRICING_HIGHLIGHTS = [
  "Sem mensalidade",
  "Sem custo fixo",
  "Você só paga quando vender",
];
const PRICING_POINTS = [
  "Sem mensalidade",
  "Sem custo fixo",
  "Sem taxa de adesão",
  "Apenas uma pequena taxa por venda realizada",
];
// Bloco de indicação: aproveita o programa existente para transformar clientes em canal orgânico de crescimento
// sem criar uma nova jornada visual fora do padrão comercial atual da landing.
const REFERRAL_STEPS = [
  "Indique outras empresas",
  "Quando elas começarem a vender",
  "Você ganha R$50 por indicação",
];
const PASSENGER_STEPS = [
  {
    icon: Calendar,
    title: "Escolha seu embarque com horário organizado",
    desc: "Compare destino, data e ponto de saída em poucos segundos, com mais segurança antes da compra.",
  },
  {
    icon: Ticket,
    title: "Compre online sem depender de atendimento manual",
    desc: "Finalize a compra em poucos cliques e receba a confirmação na hora.",
  },
  {
    icon: QrCode,
    title: "Apresente o QR Code e embarque com validação rápida",
    desc: "A equipe confere presença com mais agilidade e reduz filas no embarque.",
  },
];
// Pilar comercial principal: reforça benefícios concretos da operação sem expor linguagem interna de produto.
const PLATFORM_PILLARS = [
  {
    icon: Building2,
    title: "Vitrine profissional para vender mais",
    desc: "Tenha página própria, link público, QR Code de divulgação e redes sociais reunidas para transformar divulgação em compra.",
  },
  {
    icon: TrendingUp,
    title: "Venda online com mais controle",
    desc: "Organize viagens e eventos por saída, acompanhe ocupação e facilite a compra para o passageiro sem depender de processos manuais.",
  },
  {
    icon: Users,
    title: "Equipe comercial ou vendedores independentes",
    desc: "Distribua links individuais, acompanhe desempenho e calcule comissão de quem vende por conta própria ou em equipe.",
  },
  {
    icon: ClipboardCheck,
    title: "Operação real de embarque",
    desc: "Use lista de embarque, validação de presença e app operacional para sair com mais organização e menos confusão no dia da viagem.",
  },
];
const PLATFORM_DIFFERENTIALS = [
  {
    icon: Link2,
    title: "Link público para vender e divulgar",
    desc: "Compartilhe sua página pronta no WhatsApp, Instagram ou indicação direta para apresentar viagens, eventos e passeios.",
  },
  {
    icon: QrCode,
    title: "QR Code para divulgação e embarque",
    desc: "Use o QR Code da vitrine para atrair vendas e o QR Code da passagem para validar presença.",
  },
  {
    icon: Users,
    title: "App e comissão para vendedores",
    desc: "Fortaleça sua equipe comercial ou seus revendedores com vendas por link individual e acompanhamento de resultados.",
  },
  {
    icon: Bus,
    title: "App do motorista e equipe",
    desc: "Organize a conferência no embarque com mais segurança, menos papel e menos confusão operacional.",
  },
  {
    icon: BarChart3,
    title: "Relatórios por evento e comissão",
    desc: "Visualize vendas, presença, resultado por evento e comissão dos vendedores em um único sistema.",
  },
  {
    icon: CreditCard,
    title: "Fluxo financeiro integrado",
    desc: "A empresa opera com cobrança online e integração Asaas dentro da arquitetura atual da plataforma.",
  },
];
// Novo argumento comercial: a landing passa a comunicar monetização além da passagem
// usando a distinção real do produto entre parceiros da empresa e patrocinadores do evento.
const REVENUE_OPPORTUNITIES = [
  {
    icon: Building2,
    title: "Parceiros da empresa",
    desc: "Destaque marcas parceiras na vitrine institucional da operação e fortaleça acordos comerciais recorrentes da empresa.",
  },
  {
    icon: Star,
    title: "Patrocinadores do evento",
    desc: "Valorize apoiadores de um evento específico com apresentação mais profissional e mais argumento para novas negociações.",
  },
  {
    icon: Wallet,
    title: "Mais que passagens",
    desc: "Sem mensalidade, a operação pode vender, organizar o embarque e abrir espaço para receita adicional com visibilidade comercial.",
  },
  {
    icon: BarChart3,
    title: "Mais valor percebido",
    desc: "Uma apresentação mais profissional ajuda a transmitir credibilidade e aumenta o potencial de faturamento além da passagem.",
  },
];
// Cards de posicionamento dual: a mesma base atende empresa estruturada e quem vende de forma independente.
const BUSINESS_BENEFITS = [
  {
    icon: Building2,
    title: "Sua operação com presença digital pronta",
    desc: "Ganhe uma vitrine profissional para divulgar eventos, passeios e viagens com link próprio e redes sociais.",
  },
  {
    icon: Users,
    title: "Força comercial com vendedores",
    desc: "Cadastre vendedores, acompanhe comissões e aumente o alcance da operação sem perder controle.",
  },
  {
    icon: ClipboardCheck,
    title: "Embarque mais organizado",
    desc: "Use lista de embarque, validação de passageiros e apoio operacional no celular da equipe.",
  },
];
// Opções finais de jornada: mantemos a estrutura existente, mas com CTAs mais comerciais.
const LANDING_SOCIAL_LINKS = [
  // Centralizamos as URLs em um único ponto para facilitar futura configuração via CMS/env sem espalhar links pela landing.
  {
    key: "instagram",
    label: "Instagram",
    href: "https://instagram.com/smartbusbr",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-[18px] w-[18px]"
        aria-hidden="true"
      >
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    key: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/smartbusbroficial",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-[18px] w-[18px]"
        aria-hidden="true"
      >
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    key: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@SmartBusbr",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-[18px] w-[18px]"
        aria-hidden="true"
      >
        <path d="M23.498 6.186a2.998 2.998 0 0 0-2.11-2.12C19.533 3.563 12 3.563 12 3.563s-7.533 0-9.389.503A2.998 2.998 0 0 0 .502 6.186 31.08 31.08 0 0 0 0 12a31.08 31.08 0 0 0 .502 5.814 2.998 2.998 0 0 0 2.109 2.12c1.856.503 9.389.503 9.389.503s7.533 0 9.389-.503a2.998 2.998 0 0 0 2.11-2.12A31.08 31.08 0 0 0 24 12a31.08 31.08 0 0 0-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
      </svg>
    ),
  },
  {
    key: "x",
    label: "X",
    href: "https://x.com/smartbusbr2026",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-[18px] w-[18px]"
        aria-hidden="true"
      >
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.64 7.584H.473l8.6-9.828L0 1.153h7.594l5.243 6.932 6.064-6.932Zm-1.291 19.49h2.039L6.486 3.249H4.298L17.61 20.643Z" />
      </svg>
    ),
  },
] as const;
const socialIconLinkClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-white/65 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
// FAQ comercial posicionada perto do fechamento da landing para responder objeções sem competir com a proposta principal.
const LANDING_FAQS = [
  {
    question: "O sistema tem mensalidade?",
    answer: "Não. Você paga apenas quando vender passagens pela plataforma.",
  },
  {
    question: "Como funciona a taxa da plataforma?",
    answer: "A plataforma cobra 6% sobre cada venda realizada.",
  },
  {
    question: "Preciso ter conta no Asaas?",
    answer:
      "Não. Você pode criar sua conta durante a configuração do sistema ou conectar uma conta já existente.",
  },
  {
    question: "Preciso ter CNPJ para usar o sistema?",
    answer:
      "Não. Você pode começar a usar mesmo sem CNPJ, conforme o seu modelo de operação.",
  },
  {
    question: "Como recebo os pagamentos das vendas?",
    answer:
      "Os pagamentos são processados pelo Asaas e o valor é repassado conforme a configuração da sua operação.",
  },
  {
    question: "Posso vender passagens sem site próprio?",
    answer:
      "Sim. O sistema já oferece uma página pronta para divulgação e venda das passagens.",
  },
  {
    question: "Preciso de conhecimento técnico para usar?",
    answer:
      "Não. O sistema foi desenvolvido para ser simples, prático e fácil de operar.",
  },
  {
    question: "Em quanto tempo posso começar a vender?",
    answer:
      "Em poucos minutos você já pode configurar sua operação e começar a vender.",
  },
] as const;
// Nova seção comercial antes da FAQ: mostra que começar a vender é um processo simples,
// visual e rápido, sem transformar a landing em tutorial técnico.
const GET_STARTED_STEPS = [
  {
    icon: Calendar,
    title: "Cadastre seu evento",
    desc: "Crie o evento que será vendido na sua vitrine e apresente sua próxima saída com clareza.",
  },
  {
    icon: MapPin,
    title: "Defina locais e horários de embarque",
    desc: "Organize os pontos de saída de forma clara para o passageiro saber onde e quando embarcar.",
  },
  {
    icon: CreditCard,
    title: "Conecte sua conta de recebimento",
    desc: "Vincule sua conta Asaas para receber os pagamentos de forma simples e organizada.",
  },
  {
    icon: Link2,
    title: "Publique e compartilhe o link",
    desc: "Divulgue sua página de vendas no WhatsApp, nas redes sociais ou no seu próprio site.",
  },
  {
    icon: BarChart3,
    title: "Comece a vender passagens",
    desc: "Acompanhe sua operação e suas vendas em um só lugar, com mais visibilidade para crescer.",
  },
] as const;
const JOURNEY_OPTIONS = [
  {
    icon: Ticket,
    title: "Quero comprar minha passagem",
    desc: "Veja as próximas viagens, compare preços e garanta seu lugar com confirmação online.",
    cta: "Comprar passagem",
    to: "/eventos",
    style: "bg-background border-border hover:border-primary/30",
  },
  {
    icon: Building2,
    title: "Quero vender passagens com mais organização",
    desc: "Sirva sua empresa ou sua operação independente com link de venda, controle comercial e embarque organizado.",
    cta: "Começar a vender",
    to: "/cadastro",
    style: "bg-primary/5 border-primary/20 hover:border-primary/40",
  },
];
const LANDING_CONTACT_EMAIL = "comercial@smartbusbr.com.br";
interface LandingContactFormState {
  name: string;
  email: string;
  phone: string;
  message: string;
}
const INITIAL_CONTACT_FORM: LandingContactFormState = {
  name: "",
  email: "",
  phone: "",
  message: "",
};
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const FloatingWhatsAppIcon = () => (
  <span className="inline-flex scale-[0.7] items-center justify-center">
    <span className="sr-only">WhatsApp</span>
    <span aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-[18px] w-[18px] fill-current">
        <path d="M19.11 17.21c-.27-.14-1.61-.79-1.86-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.31.2-.58.07-.27-.14-1.12-.41-2.14-1.31-.79-.7-1.33-1.57-1.49-1.84-.16-.27-.02-.41.12-.55.12-.12.27-.31.41-.47.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.47-.07-.14-.61-1.48-.84-2.03-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.27s.97 2.64 1.11 2.82c.14.18 1.91 2.91 4.63 4.08.65.28 1.16.45 1.56.58.65.21 1.24.18 1.71.11.52-.08 1.61-.66 1.84-1.29.23-.63.23-1.18.16-1.29-.07-.11-.25-.18-.52-.32Z" />
        <path d="M16.01 3.2c-7.06 0-12.78 5.71-12.78 12.76 0 2.25.59 4.45 1.7 6.38L3.2 28.8l6.66-1.74a12.78 12.78 0 0 0 6.15 1.57h.01c7.05 0 12.78-5.71 12.78-12.76 0-3.41-1.33-6.61-3.75-9.02A12.7 12.7 0 0 0 16.01 3.2Zm0 23.3h-.01a10.58 10.58 0 0 1-5.39-1.48l-.39-.23-3.95 1.03 1.05-3.85-.25-.4a10.56 10.56 0 0 1-1.62-5.61c0-5.83 4.75-10.58 10.6-10.58 2.83 0 5.5 1.1 7.5 3.09a10.5 10.5 0 0 1 3.11 7.49c0 5.83-4.76 10.57-10.6 10.57Z" />
      </svg>
    </span>
  </span>
);
export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState<LandingContactFormState>(INITIAL_CONTACT_FORM);
  const [contactErrors, setContactErrors] = useState<Partial<Record<keyof LandingContactFormState, string>>>({});
  // CTA comercial unificado para a landing e para o botão flutuante, evitando números divergentes.
  const salesWhatsappUrl =
    buildWhatsappWaMeLink({
      phone: "(31) 99207-4309",
      message: "Quero começar a vender passagens com o Smartbus BR",
    }) ??
    "https://wa.me/5531992074309?text=Quero%20come%C3%A7ar%20a%20vender%20passagens%20com%20o%20Smartbus%20BR";
  // O header da landing usa três níveis de hierarquia.
  // Aqui os links públicos ficam leves, com ícone e hover discreto, sem virar um bloco pesado.
  const desktopNavLinkClass =
    "h-10 gap-2 rounded-md px-3.5 text-sm font-medium text-white/90 transition-all hover:bg-white/10 hover:text-white hover:-translate-y-px";
  // Mantemos os links sociais centralizados e discretos para reaproveitar a mesma configuração no CTA final e no footer.
  const landingSocialLinks = [
    ...LANDING_SOCIAL_LINKS,
    {
      key: "whatsapp",
      label: "WhatsApp",
      href: salesWhatsappUrl,
      icon: <FloatingWhatsAppIcon />,
    },
  ];
  const contactWhatsappUrl = useMemo(
    () =>
      buildWhatsappWaMeLink({
        phone: "(31) 99207-4309",
        message: [
          "Olá! Quero falar com a equipe da Smartbus BR.",
          "",
          `Nome: ${contactForm.name.trim()}`,
          `E-mail: ${contactForm.email.trim()}`,
          `Telefone/WhatsApp: ${contactForm.phone.trim()}`,
          "",
          `Mensagem: ${contactForm.message.trim()}`,
        ].join("\n"),
      }) ?? salesWhatsappUrl,
    [contactForm.email, contactForm.message, contactForm.name, contactForm.phone, salesWhatsappUrl],
  );
  const updateContactField = (field: keyof LandingContactFormState, value: string) => {
    setContactForm((current) => ({ ...current, [field]: value }));
    setContactErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const handleContactSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof LandingContactFormState, string>> = {};
    if (!contactForm.name.trim()) nextErrors.name = "Informe seu nome.";
    if (!contactForm.email.trim()) nextErrors.email = "Informe seu e-mail.";
    else if (!isValidEmail(contactForm.email)) nextErrors.email = "Informe um e-mail válido.";
    if (!contactForm.phone.trim()) nextErrors.phone = "Informe seu telefone ou WhatsApp.";
    if (!contactForm.message.trim()) nextErrors.message = "Escreva uma mensagem curta.";
    setContactErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    window.open(contactWhatsappUrl, "_blank", "noopener,noreferrer");
    setContactModalOpen(false);
    setContactForm(INITIAL_CONTACT_FORM);
  };
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="relative z-20 border-b border-white/10 bg-[hsl(222_47%_11%)] shadow-[0_18px_48px_-32px_rgba(15,23,42,0.95)]">
        <div className="mx-auto flex min-h-[4.75rem] max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:min-h-[5.5rem] sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 py-1 pr-2 sm:pr-4">
            {/* Aumentamos a logo com respiro extra para ganhar presença sem deixar o header pesado em desktop ou mobile. */}
            <img
              src={logo}
              alt="Smartbus BR"
              className="h-14 w-auto max-w-[185px] object-contain brightness-0 invert sm:h-[3.9rem] sm:max-w-[220px]"
            />
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
            className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white shadow-sm transition-colors hover:bg-white/10 md:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Menu"
          >
            {mobileMenu ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
        {mobileMenu && (
          <div className="animate-fade-in space-y-1 border-b border-white/10 bg-[hsl(222_47%_11%)] px-4 pb-5 text-white shadow-[0_20px_40px_-30px_rgba(15,23,42,0.95)] md:hidden">
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
              backgroundImage:
                "radial-gradient(circle, hsl(0 0% 100%) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
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
                    Venda passagens online, divulgue seus eventos e organize o
                    embarque
                    <span className="text-primary">
                      {" "}
                      com uma operação simples, profissional e pronta para
                      crescer.
                    </span>
                  </h1>
                  <p className="max-w-3xl text-lg text-white/70 sm:text-xl">
                    O Smartbus BR ajuda empresas e vendedores independentes a
                    vender mais, compartilhar link próprio, acompanhar
                    resultados e garantir um embarque mais organizado sem
                    estrutura complexa.
                  </p>
                  {/*
                    Reforçamos "sem mensalidade" ainda no hero porque este é o principal argumento de conversão:
                    reduz objeção de custo fixo e deixa claro que a plataforma cresce junto com a venda do cliente.
                  */}
                  <div className="flex flex-wrap gap-2.5">
                    {PRICING_HIGHLIGHTS.map((highlight) => (
                      <span
                        key={highlight}
                        className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-2 text-sm font-semibold text-white"
                      >
                        <Wallet className="h-4 w-4 text-primary" />
                        {highlight}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-white/80">
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">
                    Venda online e embarque no mesmo fluxo
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">
                    Serve para empresas e para quem vende por conta própria
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium">
                    Mais controle para crescer sem complicação
                  </div>
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
              {/* CTA direto: removemos a busca simulada para deixar claro que a jornada principal é criar o evento e começar a vender. */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/20 backdrop-blur-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                      Comece agora
                    </p>
                    <p className="text-sm text-white/70 sm:text-base">
                      Crie seu evento, publique seu link de vendas e coloque a
                      operação para rodar sem fricção.
                    </p>
                  </div>
                  <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-center">
                    <Link
                      to="/cadastro"
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 lg:min-w-[320px]"
                    >
                      Criar evento e começar a vender
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                    <p className="text-sm text-white/60">
                      Leva menos de 2 minutos. Sem complicação.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Coluna lateral reaproveita os cards flutuantes para deixar claros os dois públicos,
                mas agora priorizando o valor comercial que a empresa ganha ao entrar na plataforma. */}
            <div className="grid gap-4 lg:pl-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-5 text-white backdrop-blur-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                      Para quem quer viajar
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">
                      Compra simples, confirmação rápida e embarque sem fila
                    </h2>
                  </div>
                </div>
                <div className="space-y-3 text-sm text-white/75">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-primary" /> Compre online
                    sem depender de atendimento manual
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Pague com
                    segurança e receba confirmação na hora
                  </div>
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-primary" /> Embarque com QR
                    Code validado pela equipe
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-primary/20 bg-primary/10 p-5 text-white backdrop-blur-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                      Para empresas e vendedores independentes
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">
                      Uma estrutura simples para vender, divulgar e operar
                      melhor
                    </h2>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {BUSINESS_BENEFITS.map((benefit) => (
                    <div
                      key={benefit.title}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
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
                Para quem vende passagens — empresas e vendedores independentes
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Feito para quem quer vender mais passagens com organização e
                presença profissional
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                O Smartbus BR foi feito para quem vende passagens — seja uma
                empresa estruturada ou alguém que vende por conta própria.
                Divulgue suas viagens, acompanhe vendas, organize embarques e
                tenha controle total para crescer com mais profissionalismo.
              </p>
              {/* Ajuste de conversão: a copy desta seção reduz o foco institucional em empresa e equilibra empresa + autônomo sem alterar o layout. */}
              {/* Refinamento visual: reduzimos a sensação de grade crua com cards mais macios, melhor espaçamento e profundidade discreta. */}
              <div className="grid gap-4 sm:grid-cols-2">
                {PLATFORM_PILLARS.map((benefit) => (
                  <div
                    key={benefit.title}
                    className="rounded-[1.6rem] border border-border/70 bg-gradient-to-br from-card to-muted/20 p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.35)]"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <benefit.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">
                      {benefit.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {benefit.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-primary/15 bg-[hsl(222_47%_11%)] p-6 text-white shadow-xl shadow-primary/5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Vitrine própria
                  </p>
                  <p className="mt-3 text-3xl font-bold text-primary">
                    Link + QR Code
                  </p>
                  <p className="mt-2 text-sm text-white/65">
                    para divulgar suas viagens, compartilhar seu link de vendas
                    e centralizar tudo em uma página profissional.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Resultado operacional
                  </p>
                  <p className="mt-3 text-3xl font-bold text-primary">
                    Menos confusão
                  </p>
                  <p className="mt-2 text-sm text-white/65">
                    com lista de embarque, controle de presença e validação
                    rápida para equipe e passageiro.
                  </p>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/10 p-5">
                <p className="text-sm text-white/75">
                  Da divulgação ao embarque, você ganha uma estrutura mais
                  organizada para vender, operar e acompanhar tudo o que
                  acontece em cada evento.
                </p>
                <Link
                  to="/cadastro"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Quero começar a vender melhor
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Wallet className="h-3.5 w-3.5" />
                Modelo de custo simples e previsível
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Quanto custa usar o Smartbus?
              </h2>
              <p className="max-w-2xl text-muted-foreground sm:text-lg">
                O Smartbus BR foi desenhado para tirar o peso do custo fixo e facilitar a decisão de começar.
              </p>
            </div>
            {/*
              Bloco de valor comercial: explicita ausência de mensalidade para reduzir objeção financeira
              e aumentar conversão sem mudar a estrutura visual predominante de cards da landing.
            */}
            <div className="rounded-[2rem] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.03] p-6 shadow-[0_28px_70px_-52px_rgba(15,23,42,0.45)] sm:p-7">
              {/* Refinamento visual: reduzimos a sensação de grade crua com cards mais macios, melhor espaçamento e um painel de apoio com destaque de valor. */}
              <div className="grid gap-3.5 sm:grid-cols-2">
                {PRICING_POINTS.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-[1.35rem] border border-primary/10 bg-gradient-to-br from-white to-muted/40 p-4 text-sm text-foreground shadow-[0_20px_45px_-35px_rgba(15,23,42,0.45)] transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              {/* A caixa final concentra a proposta comercial para diferenciar a mensagem principal dos itens de apoio. */}
              <div className="mt-5 rounded-[1.6rem] border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 text-sm text-muted-foreground shadow-[0_20px_40px_-35px_rgba(249,115,22,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                  Sem custo para começar
                </p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  Você entra sem risco de custo recorrente e acompanha o crescimento da operação pagando apenas quando houver venda.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Isso deixa a decisão mais leve para testar, validar demanda e crescer sem assumir mensalidade antes da primeira venda.
                </p>
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
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Serve para sua empresa e também para quem vende passagens por
              conta própria
            </h2>
            <p className="mt-3 text-muted-foreground sm:text-lg">
              {/* Ajuste estratégico de copy: deixamos explícita a dualidade empresa + autônomo sem criar nova arquitetura visual. */}
              Seja para profissionalizar uma operação completa ou começar com um
              link de venda no celular, o Smartbus BR ajuda a divulgar melhor,
              vender com mais controle e garantir um embarque mais organizado.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                Empresas
              </p>
              <h3 className="mt-3 text-2xl font-bold text-foreground">
                Mais estrutura para vender, operar e acompanhar resultados
              </h3>
              <p className="mt-3 text-muted-foreground">
                Organize equipe comercial, acompanhe saídas, valide embarque e
                centralize relatórios em um fluxo mais profissional.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{" "}
                  Controle da operação e dos vendedores no mesmo lugar
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{" "}
                  Embarque mais organizado, com menos papel e menos confusão
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{" "}
                  Presença digital pronta para divulgar viagens e eventos
                </li>
              </ul>
            </div>
            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                Vendedores independentes
              </p>
              <h3 className="mt-3 text-2xl font-bold text-foreground">
                Mais praticidade para vender pelo link e se apresentar com
                profissionalismo
              </h3>
              <p className="mt-3 text-muted-foreground">
                Ideal para quem vende por WhatsApp, Instagram, indicação direta
                ou excursão própria e quer sair do improviso sem complicação.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{" "}
                  Link de venda para compartilhar com clientes no celular
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{" "}
                  Mais controle das passagens vendidas e dos lugares confirmados
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{" "}
                  Serve para quem está começando e para quem já quer crescer
                  organizado
                </li>
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
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                A experiência de compra continua simples para o passageiro
              </h2>
              <p className="max-w-2xl text-muted-foreground">
                A mesma estrutura que fortalece a empresa também ajuda o
                passageiro a decidir rápido, confiar na compra e chegar mais
                preparado ao embarque.
              </p>
            </div>
            <Link
              to="/eventos"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
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
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-bold ${trip.urgencyTone}`}
                    >
                      {trip.urgency}
                    </span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-100">
                      {trip.status}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
                        A partir de
                      </p>
                      <p className="text-3xl font-extrabold text-white">
                        R$ {trip.price.toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                      {trip.date}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <h3 className="text-xl font-bold text-foreground transition-colors group-hover:text-primary">
                      {trip.name}
                    </h3>
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
                    <div className="text-sm text-muted-foreground">
                      Embarque sem fila com QR Code
                    </div>
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
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Como o Smartbus BR ajuda a vender mais e embarcar com menos
              confusão
            </h2>
            <p className="mt-2 text-muted-foreground">
              Uma jornada clara para divulgar melhor, vender com mais controle e
              validar o embarque com segurança.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {PASSENGER_STEPS.map((step, index) => (
              <div
                key={step.title}
                className="relative rounded-3xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Diferenciais que mostram a força real do produto
              </h2>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Transforme sua divulgação em vendas, acompanhe sua operação com
                mais clareza e leve mais organização para o embarque de cada
                evento.
              </p>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {PLATFORM_DIFFERENTIALS.map((item) => (
              <div
                key={item.title}
                className="group rounded-3xl border border-border/70 bg-gradient-to-br from-card to-muted/20 p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_30px_65px_-42px_rgba(249,115,22,0.35)]"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/5" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Nova seção comercial posicionada após os benefícios operacionais para ampliar a narrativa de valor sem criar fluxo novo. */}
          <div className="grid gap-6 rounded-[2rem] border border-primary/15 bg-card p-6 shadow-[0_28px_70px_-52px_rgba(15,23,42,0.45)] sm:p-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Wallet className="h-3.5 w-3.5" />
                Monetização além da passagem
              </div>
              {/* Hierarquia de copy: reforçamos ausência de mensalidade e potencial comercial sem prometer renda garantida. */}
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Venda passagens e abra novas fontes de receita
              </h2>
              <p className="max-w-2xl text-muted-foreground sm:text-lg">
                No Smartbus BR, você não paga mensalidade e ainda pode valorizar sua operação com parceiros da empresa e patrocinadores do evento, criando novas oportunidades de faturamento com apresentação mais profissional.
              </p>
              <div className="rounded-[1.5rem] border border-primary/15 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 shadow-[0_20px_45px_-36px_rgba(249,115,22,0.4)]">
                <p className="text-sm font-semibold text-foreground sm:text-base">
                  Sem mensalidade. Sem custo fixo. E com potencial de receita além da passagem.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  A plataforma ajuda a vender, organizar, dar visibilidade comercial às marcas apoiadoras e fortalecer a credibilidade da empresa e de cada evento.
                </p>
              </div>
            </div>
            {/* Responsividade: os blocos empilham em uma grade simples para manter leitura clara em desktop, tablet e mobile. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {REVENUE_OPPORTUNITIES.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.6rem] border border-border/70 bg-gradient-to-br from-card to-muted/25 p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.32)]"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Escolha como você quer usar o Smartbus BR
            </h2>
            <p className="mt-2 text-muted-foreground">
              Em poucos segundos, fica claro se você quer comprar sua passagem
              ou começar a vender com mais organização.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {JOURNEY_OPTIONS.map((option) => (
              <div
                key={option.title}
                className={`rounded-3xl border p-6 shadow-sm transition-all duration-300 ${option.style}`}
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <option.icon className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">
                  {option.title}
                </h3>
                <p className="mt-3 max-w-xl text-muted-foreground">
                  {option.desc}
                </p>
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
      <section className="bg-muted/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Gift className="h-3.5 w-3.5" />
                Crescimento orgânico com recompensa
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Indique o Smartbus e Ganhe
              </h2>
              <p className="max-w-2xl text-muted-foreground sm:text-lg">
                Transforme sua rede de contatos em um novo canal de crescimento: indique empresas que também querem vender mais e seja recompensado quando elas começarem a operar.
              </p>
            </div>
            {/*
              A seção "Indique e Ganhe" reforça crescimento orgânico e adiciona incentivo simples para compartilhar a plataforma.
              Mantemos cards e CTA já conhecidos para aumentar conversão sem inventar um novo padrão visual.
            */}
            <div className="rounded-[2rem] border border-primary/20 bg-card p-6 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.45)] sm:p-7">
              {/* Os passos ganham acabamento de painel comercial para destacar a recompensa sem criar uma nova linguagem visual. */}
              <div className="rounded-[1.6rem] border border-primary/10 bg-gradient-to-br from-primary/10 via-transparent to-muted/40 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                  Recompensa simples e direta
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground sm:text-xl">
                  Indique empresas que começam a vender e receba R$50 por cada operação ativada.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  A proposta fica mais clara: você ajuda outra empresa a profissionalizar as vendas e ainda cria uma nova fonte de receita por indicação.
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {REFERRAL_STEPS.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-start gap-3 rounded-[1.35rem] border border-primary/10 bg-gradient-to-r from-white to-muted/40 p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]"
                  >
                    {/* A numeração fica mais evidente no mobile e em desktop para dar cadência comercial aos passos. */}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm shadow-primary/30">
                      {index + 1}
                    </span>
                    <span className="text-sm text-foreground">{step}</span>
                  </div>
                ))}
              </div>
              {/* Hierarquia de CTA: reforçamos o principal e mantemos o secundário como alternativa de baixa fricção. */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/cadastro"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  Começar agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/cadastro"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Criar conta grátis
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-primary/15 bg-card p-8 text-center shadow-xl sm:p-10">
            {/* CTA final reforçado para conversão B2B sem remover a alternativa do passageiro. */}
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Comece a vender passagens com mais organização, presença digital e
              controle
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-muted-foreground sm:text-lg">
              {/* CTA final com menos objeção: reforça facilidade para empresa e autônomo sem prometer funcionalidades novas. */}
              Com o Smartbus BR, sua empresa ou operação independente pode
              divulgar melhor, vender online, acompanhar resultados e organizar
              o embarque sem depender de uma estrutura complexa.
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
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2">
                <Building2 className="h-4 w-4 text-primary" /> Link de venda e
                vitrine profissional
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2">
                <Users className="h-4 w-4 text-primary" /> Funciona para equipe
                comercial e vendedor independente
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2">
                <Bus className="h-4 w-4 text-primary" /> Lista de embarque e
                validação no celular
              </span>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-border/80 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    <MessageCircleMore className="h-4 w-4 text-primary" />
                    Falar com a gente
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Fale com a equipe da Smartbus BR</DialogTitle>
                    <DialogDescription>
                      Fale com a nossa equipe para tirar dúvidas sobre implantação, uso do sistema ou parceria comercial.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleContactSubmit}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="landing-contact-name">Nome</Label>
                        <Input
                          id="landing-contact-name"
                          value={contactForm.name}
                          onChange={(event) => updateContactField("name", event.target.value)}
                          placeholder="Seu nome"
                        />
                        {contactErrors.name && <p className="text-sm text-destructive">{contactErrors.name}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="landing-contact-email">E-mail</Label>
                        <Input
                          id="landing-contact-email"
                          type="email"
                          value={contactForm.email}
                          onChange={(event) => updateContactField("email", event.target.value)}
                          placeholder={LANDING_CONTACT_EMAIL}
                        />
                        {contactErrors.email && <p className="text-sm text-destructive">{contactErrors.email}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="landing-contact-phone">Telefone ou WhatsApp</Label>
                      <Input
                        id="landing-contact-phone"
                        value={contactForm.phone}
                        onChange={(event) => updateContactField("phone", event.target.value)}
                        placeholder="(00) 00000-0000"
                      />
                      {contactErrors.phone && <p className="text-sm text-destructive">{contactErrors.phone}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="landing-contact-message">Mensagem</Label>
                      <Textarea
                        id="landing-contact-message"
                        value={contactForm.message}
                        onChange={(event) => updateContactField("message", event.target.value)}
                        placeholder="Conte rapidamente como podemos ajudar."
                        rows={5}
                      />
                      {contactErrors.message && <p className="text-sm text-destructive">{contactErrors.message}</p>}
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/50 p-4 text-sm text-muted-foreground">
                      Nesta etapa, o envio reutiliza o canal comercial já existente da landing para manter o fluxo simples, previsível e sem criar uma nova integração de backend.
                    </div>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => setContactModalOpen(false)}>
                        Fechar
                      </Button>
                      <Button type="submit">Enviar contato</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              <a
                href={`mailto:${LANDING_CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {LANDING_CONTACT_EMAIL}
              </a>
            </div>
            <div className="mt-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                Acompanhe nossos conteúdos e novidades
              </p>
              <div className="flex items-center justify-center gap-2">
                {landingSocialLinks
                  .filter((item) => item.key !== "whatsapp")
                  .map((item) => (
                    <a
                      key={item.key}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      title={item.label}
                      className={socialIconLinkClass.replace(
                        "text-white/65",
                        "text-muted-foreground",
                      )}
                    >
                      {item.icon}
                    </a>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Nova seção inserida imediatamente antes da FAQ para reduzir objeção inicial
              e mostrar que começar a vender no Smartbus BR é rápido e organizado. */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Comece com clareza e sem complicação
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Como começar a vender com a Smartbus BR
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-muted-foreground sm:text-lg">
              Configure sua operação, publique seu evento e compartilhe o link de vendas.
            </p>
          </div>
          {/* Bloco de steps: usa cards numerados no padrão visual já existente da landing
              para manter leitura rápida em desktop e empilhamento elegante no mobile. */}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            {GET_STARTED_STEPS.map((step, index) => (
              <div
                key={step.title}
                className="relative rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md"
              >
                <span className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="max-w-[85%] text-lg font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
          {/* CTA da nova seção: reaproveita o mesmo padrão de botão primário já usado
              em outros pontos da landing para manter consistência visual e comercial. */}
          <div className="mt-10 flex justify-center">
            <Link
              to="/cadastro"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Criar meu primeiro evento
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <section className="bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Perguntas frequentes
            </h2>
            <p className="mt-2 text-muted-foreground">
              Tire suas principais dúvidas sobre o Smartbus BR
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
            {/* O accordion mantém a leitura leve e deixa só uma resposta aberta por vez, evitando um bloco visual pesado perto do footer. */}
            <Accordion type="single" collapsible defaultValue="faq-0" className="w-full">
              {LANDING_FAQS.map((item, index) => (
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
      <footer className="border-t border-white/5 bg-[hsl(222_47%_11%)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4 sm:col-span-2 lg:col-span-1">
              <img
                src={logo}
                alt="Smartbus BR"
                className="h-10 object-contain brightness-0 invert"
              />
              <p className="text-sm leading-relaxed text-white/40">
                Plataforma para empresas de viagens, eventos e excursões
                venderem, divulgarem e operarem com mais controle.
              </p>
              <button
                type="button"
                onClick={() => setContactModalOpen(true)}
                className="inline-flex items-center gap-2 text-sm font-medium text-white/65 transition-colors hover:text-white"
              >
                <MessageCircleMore className="h-4 w-4 text-primary" />
                Contato comercial
              </button>
              <div className="flex items-center gap-1">
                {landingSocialLinks.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                    title={item.label}
                    className={socialIconLinkClass}
                  >
                    {item.icon}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">
                Para passageiros
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to="/eventos"
                    className="text-sm text-white/40 transition-colors hover:text-white"
                  >
                    Buscar viagens
                  </Link>
                </li>
                <li>
                  <Link
                    to="/consultar-passagens"
                    className="text-sm text-white/40 transition-colors hover:text-white"
                  >
                    Consultar passagens
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">
                Para empresas
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to="/cadastro"
                    className="text-sm text-white/40 transition-colors hover:text-white"
                  >
                    Cadastrar empresa
                  </Link>
                </li>
                <li>
                  <Link
                    to="/login"
                    className="text-sm text-white/40 transition-colors hover:text-white"
                  >
                    Acessar painel
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">
                Institucional
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to="/politica-de-intermediacao"
                    className="text-sm text-white/40 transition-colors hover:text-white"
                  >
                    Política de intermediação
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-white/5 py-5">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="text-center text-xs text-white/30">
              © {new Date().getFullYear()} Smartbus BR. Todos os direitos
              reservados • CNPJ 59.461.123/0001-72
            </p>
          </div>
        </div>
      </footer>
      <FloatingWhatsApp />
    </div>
  );
}
