import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";

// Auth
import Login from "./pages/Login";

// Admin pages
import Events from "./pages/admin/Events";
import EventDetail from "./pages/admin/EventDetail";
import Fleet from "./pages/admin/Fleet";
import Drivers from "./pages/admin/Drivers";
import BoardingLocations from "./pages/admin/BoardingLocations";
import Sellers from "./pages/admin/Sellers";
import Sales from "./pages/admin/Sales";
import UsersPage from "./pages/admin/Users";
import CompanyPage from "./pages/admin/Company";
import MyAccount from "./pages/admin/MyAccount";
import Sponsors from "./pages/admin/Sponsors";
import Partners from "./pages/admin/Partners";

// Seller (mobile-first, fora do admin)
import SellerDashboard from "./pages/seller/SellerDashboard";

// Public pages
import PublicEvents from "./pages/public/PublicEvents";
import PublicEventDetail from "./pages/public/PublicEventDetail";
import Checkout from "./pages/public/Checkout";
import Confirmation from "./pages/public/Confirmation";
import TicketLookup from "./pages/public/TicketLookup";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Redirect root to public events */}
            <Route path="/" element={<Navigate to="/eventos" replace />} />
            
            {/* Auth */}
            <Route path="/login" element={<Login />} />
            
            {/* Public Portal */}
            <Route path="/eventos" element={<PublicEvents />} />
            <Route path="/eventos/:id" element={<PublicEventDetail />} />
            <Route path="/eventos/:id/checkout" element={<Checkout />} />
            <Route path="/confirmacao/:id" element={<Confirmation />} />
            <Route path="/consultar-passagens" element={<TicketLookup />} />
            
            {/* Seller Portal (mobile-first, fora do admin) */}
            <Route path="/vendedor/minhas-vendas" element={<SellerDashboard />} />
            {/* Redirect legado para manter bookmarks */}
            <Route path="/admin/minhas-vendas" element={<Navigate to="/vendedor/minhas-vendas" replace />} />

            {/* Admin Panel */}
            <Route path="/admin/eventos" element={<Events />} />
            <Route path="/admin/eventos/:id" element={<EventDetail />} />
            <Route path="/admin/frota" element={<Fleet />} />
            <Route path="/admin/motoristas" element={<Drivers />} />
            <Route path="/admin/locais" element={<BoardingLocations />} />
            <Route path="/admin/vendedores" element={<Sellers />} />
            <Route path="/admin/vendas" element={<Sales />} />
            <Route path="/admin/usuarios" element={<UsersPage />} />
            <Route path="/admin/empresa" element={<CompanyPage />} />
            <Route path="/admin/minha-conta" element={<MyAccount />} />
            <Route path="/admin/patrocinadores" element={<Sponsors />} />
            <Route path="/admin/parceiros" element={<Partners />} />
            
            {/* Catch all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
