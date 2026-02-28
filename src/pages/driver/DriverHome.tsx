import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, LogOut, QrCode } from 'lucide-react';

export default function DriverHome() {
  const navigate = useNavigate();
  const { user, loading, userRole, signOut, profile } = useAuth();

  // Normaliza acesso: além do motorista, perfis operacionais também podem abrir o fluxo mobile.
  const canAccessDriverPortal = userRole === 'motorista' || userRole === 'operador' || userRole === 'gerente' || userRole === 'developer';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Enquanto role ainda não foi resolvida no contexto, evita redirecionar incorretamente.
  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!canAccessDriverPortal) return <Navigate to="/admin/eventos" replace />;

  const firstName = (profile?.name || user.user_metadata?.name || 'Motorista').split(' ')[0];

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Logo size="lg" />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-6 p-5">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Olá, {firstName}.</p>
              <h1 className="text-xl font-semibold">Validação de passagens</h1>
              <p className="text-sm text-muted-foreground">
                Aponte a câmera para o QR da passagem para validar.
              </p>
            </div>

            <Button className="h-14 w-full text-base" onClick={() => navigate('/motorista/validar')}>
              <QrCode className="mr-2 h-5 w-5" />
              Validar passagens (QR Code)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
