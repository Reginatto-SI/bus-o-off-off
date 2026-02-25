import { useEffect, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Logo } from "@/components/Logo";
import { Checkbox } from "@/components/ui/checkbox";

function getRedirectByRole(role: string | null): string {
  if (role === "vendedor") return "/vendedor/minhas-vendas";
  return "/admin/eventos";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const { signIn, user, userRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const rememberEmailKey = "boo.remember_email";
  const rememberedEmailKey = "boo.remembered_email";

  useEffect(() => {
    const shouldRememberEmail =
      localStorage.getItem(rememberEmailKey) === "true";
    const rememberedEmail = localStorage.getItem(rememberedEmailKey) ?? "";

    if (shouldRememberEmail && rememberedEmail) {
      setEmail(rememberedEmail);
    }

    setRememberEmail(shouldRememberEmail);
  }, []);

  // Redirect após login bem-sucedido ou sessão existente
  useEffect(() => {
    if (user && userRole) {
      navigate(getRedirectByRole(userRole), { replace: true });
    }
  }, [user, userRole, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Sessão existente: aguardar role resolver antes de redirecionar
  if (user) {
    if (!userRole) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return <Navigate to={getRedirectByRole(userRole)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError("Email ou senha inválidos");
      setLoading(false);
    } else {
      if (rememberEmail) {
        localStorage.setItem(rememberEmailKey, "true");
        localStorage.setItem(rememberedEmailKey, email);
      } else {
        localStorage.removeItem(rememberEmailKey);
        localStorage.removeItem(rememberedEmailKey);
      }
      // Redirect será tratado pelo useEffect quando user + userRole resolverem
      setLoginSuccess(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-3">
        {/* Ação secundária para não prender o usuário no fluxo administrativo por engano. */}
        <Button
          asChild
          variant="ghost"
          className="h-auto px-0 text-muted-foreground hover:text-foreground"
        >
          <Link
            to="/eventos"
            className="inline-flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Eventos
          </Link>
        </Button>

        <Card className="w-full animate-fade-in">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <Logo size="xl" />
            </div>
            <CardTitle className="text-2xl">Smartbus BR</CardTitle>
            <CardDescription>
              Entre com suas credenciais para acessar o painel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="remember-email"
                    checked={rememberEmail}
                    onCheckedChange={(checked) =>
                      setRememberEmail(checked === true)
                    }
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="remember-email"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Lembrar meu e-mail
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Salva apenas o e-mail neste navegador.
                    </p>
                  </div>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
