import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { VersionUpdateBanner } from "@/components/system/VersionUpdateBanner";

// Auth
import Login from "./pages/Login";

// Admin pages
import Dashboard from "./pages/admin/Dashboard";
import Events from "./pages/admin/Events";
import EventDetail from "./pages/admin/EventDetail";
import Fleet from "./pages/admin/Fleet";
import Drivers from "./pages/admin/Drivers";
import BoardingAssistants from "./pages/admin/BoardingAssistants";
import BoardingLocations from "./pages/admin/BoardingLocations";
import Sellers from "./pages/admin/Sellers";
import Sales from "./pages/admin/Sales";
import UsersPage from "./pages/admin/Users";
import CompanyPage from "./pages/admin/Company";
import MyAccount from "./pages/admin/MyAccount";
import Sponsors from "./pages/admin/Sponsors";
import SociosSplit from "./pages/admin/SociosSplit";
import SalesReport from "./pages/admin/SalesReport";
import SellersCommissionReport from "./pages/admin/SellersCommissionReport";
import TemplatesLayout from "./pages/admin/TemplatesLayout";
import CommercialPartners from "./pages/admin/CommercialPartners";
import SalesDiagnostic from "./pages/admin/SalesDiagnostic";
import BoardingManifestReport from "./pages/admin/BoardingManifestReport";
import EventReport from "./pages/admin/EventReport";
import Referrals from "./pages/admin/Referrals";
import BenefitPrograms from "./pages/admin/BenefitPrograms";
import BenefitProgramEditor from "./pages/admin/BenefitProgramEditor";
import Services from "./pages/admin/Services";
import ServiceSales from "./pages/admin/ServiceSales";

// Seller (mobile-first, fora do admin)
import SellerDashboard from "./pages/seller/SellerDashboard";
import DriverHome from "./pages/driver/DriverHome";
import DriverValidate from "./pages/driver/DriverValidate";
import DriverBoarding from "./pages/driver/DriverBoarding";
import DriverPreferences from "./pages/driver/DriverPreferences";
import RepresentativeDashboard from "./pages/representative/RepresentativeDashboard";

// Public pages
import PublicEvents from "./pages/public/PublicEvents";
import PublicEventDetail from "./pages/public/PublicEventDetail";
import Checkout from "./pages/public/Checkout";
import Confirmation from "./pages/public/Confirmation";
import TicketLookup from "./pages/public/TicketLookup";
import SellerRedirect from "./pages/public/SellerRedirect";
import CompanyRegistration from "./pages/public/CompanyRegistration";
import CompanyReferralRedirect from "./pages/public/CompanyReferralRedirect";
import PublicCompanyShowcase from "./pages/public/PublicCompanyShowcase";
import PublicCompanyShortLink from "./pages/public/PublicCompanyShortLink";
import IntermediationPolicy from "./pages/public/IntermediationPolicy";
import AboutSmartbus from "./pages/public/AboutSmartbus";
import RepresentativeRegistration from "./pages/public/RepresentativeRegistration";
import SystemForExcursionsPage from "./pages/public/SystemForExcursionsPage";
import HowToOrganizeExcursionPage from "./pages/public/HowToOrganizeExcursionPage";

import PublicRootRedirect from "./pages/public/PublicRootRedirect";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          {/* Banner global para avisar nova versão sem depender de PWA/service worker */}
          <VersionUpdateBanner />
          <Routes>
            {/* Redirect root to public events */}
            <Route path="/" element={<PublicRootRedirect />} />
            
            {/* Auth */}
            <Route path="/login" element={<Login />} />
            
            {/* Public Portal */}
            <Route path="/eventos" element={<PublicEvents />} />
            <Route path="/eventos/:id" element={<PublicEventDetail />} />
            <Route path="/eventos/:id/checkout" element={<Checkout />} />
            <Route path="/confirmacao/:id" element={<Confirmation />} />
            <Route path="/consultar-passagens" element={<TicketLookup />} />
            <Route path="/v/:code" element={<SellerRedirect />} />
            <Route path="/cadastro" element={<CompanyRegistration />} />
            <Route path="/seja-representante" element={<RepresentativeRegistration />} />
            <Route path="/i/:code" element={<CompanyReferralRedirect />} />
            {/* Redirect legado para manter links antigos de onboarding público. */}
            <Route path="/cadastro-empresa" element={<Navigate to="/cadastro" replace />} />
            <Route path="/empresa/:nick" element={<PublicCompanyShowcase />} />
            <Route path="/politica-de-intermediacao" element={<IntermediationPolicy />} />
            {/* Página institucional enxuta para explicar a proposta da plataforma sem promessas exageradas. */}
            <Route path="/sobre-smartbus-br" element={<AboutSmartbus />} />
            <Route path="/sistema-para-excursoes" element={<SystemForExcursionsPage />} />
            <Route path="/como-organizar-excursao" element={<HowToOrganizeExcursionPage />} />
            
            {/* Seller Portal (mobile-first, fora do admin) */}
            <Route path="/vendedor/minhas-vendas" element={<SellerDashboard />} />
            {/* Redirect legado para manter bookmarks */}
            <Route path="/admin/minhas-vendas" element={<Navigate to="/vendedor/minhas-vendas" replace />} />

            {/* Driver Portal (mobile-first, fora do admin) */}
            <Route path="/motorista" element={<DriverHome />} />
            <Route path="/motorista/validar" element={<DriverValidate />} />
            <Route path="/motorista/embarque" element={<DriverBoarding />} />
            <Route path="/motorista/preferencias" element={<DriverPreferences />} />

            {/* Representative Portal (área exclusiva, fora do admin) */}
            <Route path="/representante/painel" element={<RepresentativeDashboard />} />

            {/* Admin Panel */}
            {/* Redireciona a rota base do admin para o dashboard mantendo o layout e guardas atuais. */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/eventos" element={<Events />} />
            <Route path="/admin/eventos/:id" element={<EventDetail />} />
            <Route path="/admin/frota" element={<Fleet />} />
            <Route path="/admin/motoristas" element={<Drivers />} />
            <Route path="/admin/auxiliares-embarque" element={<BoardingAssistants />} />
            <Route path="/admin/locais" element={<BoardingLocations />} />
            <Route path="/admin/vendedores" element={<Sellers />} />
            <Route path="/admin/vendas" element={<Sales />} />
            <Route path="/admin/usuarios" element={<UsersPage />} />
            <Route path="/admin/empresa" element={<CompanyPage />} />
            <Route path="/admin/indicacoes" element={<Referrals />} />
            <Route path="/admin/minha-conta" element={<MyAccount />} />
            <Route path="/admin/patrocinadores" element={<Sponsors />} />
            <Route path="/admin/socios" element={<SociosSplit />} />
            <Route path="/admin/parceiros" element={<CommercialPartners />} />
            <Route path="/admin/programas-beneficio" element={<BenefitPrograms />} />
            <Route path="/admin/programas-beneficio/novo" element={<BenefitProgramEditor />} />
            <Route path="/admin/programas-beneficio/:id" element={<BenefitProgramEditor />} />
            <Route path="/admin/servicos" element={<Services />} />
            <Route path="/vendas/servicos" element={<ServiceSales />} />
            <Route path="/admin/relatorios/vendas" element={<SalesReport />} />
            <Route path="/admin/relatorios/eventos" element={<EventReport />} />
            <Route path="/admin/relatorios/comissao-vendedores" element={<SellersCommissionReport />} />
            <Route path="/admin/relatorios/lista-embarque" element={<BoardingManifestReport />} />
            <Route path="/admin/templates-layout" element={<TemplatesLayout />} />
            <Route path="/admin/diagnostico-vendas" element={<SalesDiagnostic />} />
            
            <Route path="/:nick" element={<PublicCompanyShortLink />} />

            {/* Catch all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
