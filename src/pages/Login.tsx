import { useEffect, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Logo } from "@/components/Logo";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

function getRedirectByRole(role: string | null, isRepresentative: boolean): string {
  // Papéis administrativos têm precedência sobre representante para evitar prender admins no painel rep.
  if (role === "gerente" || role === "developer" || role === "operador") return "/admin/dashboard";
  if (role === "vendedor") return "/vendedor/minhas-vendas";
  if (role === "motorista") return "/validador";
  if (isRepresentative) return "/representante/painel";
  return "/admin/dashboard";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySuccessMessage, setRecoverySuccessMessage] = useState("");
  const [loginSuccess, setLoginSuccess] = useState(false);
  const { signIn, user, userRole, loading: authLoading, isRepresentative } = useAuth();
  const navigate = useNavigate();
  const rememberEmailKey = "boo.remember_email";
  const rememberedEmailKey = "boo.remembered_email";
  const [flowMode, setFlowMode] = useState<"default" | "recovery" | "magiclink" | "signup">("default");

  const isRecoveryFlow = flowMode === "recovery";

  useEffect(() => {
    const shouldRememberEmail =
      localStorage.getItem(rememberEmailKey) === "true";
    const rememberedEmail = localStorage.getItem(rememberedEmailKey) ?? "";

    if (shouldRememberEmail && rememberedEmail) {
      setEmail(rememberedEmail);
    }

    setRememberEmail(shouldRememberEmail);
  }, []);

  useEffect(() => {
    // Comentário: o retorno do Supabase pode informar o tipo no hash (#type=recovery)
    // e também controlamos por query string explícita (?flow=recovery) enviada pelo backend admin.
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const flow = searchParams.get("flow");
    const hashType = hashParams.get("type");

    if (flow === "recovery" || hashType === "recovery") {
      setFlowMode("recovery");
      return;
    }
    if (flow === "magiclink" || hashType === "magiclink") {
      setFlowMode("magiclink");
      return;
    }
    if (flow === "signup" || hashType === "signup") {
      setFlowMode("signup");
      return;
    }
    setFlowMode("default");
  }, []);

  // Redirect após login bem-sucedido ou sessão existente
  useEffect(() => {
    // Em recovery, não redirecionamos automaticamente: priorizamos concluir troca de senha.
    if (!isRecoveryFlow && user && (userRole || isRepresentative)) {
      navigate(getRedirectByRole(userRole, isRepresentative), { replace: true });
    }
  }, [user, userRole, navigate, isRecoveryFlow, isRepresentative]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Sessão existente: aguardar role resolver antes de redirecionar
  if (user) {
    if (isRecoveryFlow) {
      // Em fluxo de recovery com sessão ativa, mantemos a tela para o usuário definir a nova senha.
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="w-full max-w-md space-y-3">
            <Card className="w-full animate-fade-in">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4">
                  <Logo size="xl" />
                </div>
                <CardDescription>
                  Defina sua nova senha para concluir a recuperação de acesso.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recoverySuccessMessage && (
                  <Alert className="mb-4">
                    <AlertDescription>{recoverySuccessMessage}</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    setRecoverySuccessMessage("");

                    if (!newPassword || newPassword.length < 6) {
                      setError("A nova senha deve ter pelo menos 6 caracteres.");
                      return;
                    }

                    if (newPassword !== confirmNewPassword) {
                      setError("As senhas não coincidem.");
                      return;
                    }

                    setRecoveryLoading(true);
                    const { error: updateError } = await supabase.auth.updateUser({
                      password: newPassword,
                    });

                    if (updateError) {
                      setError("Não foi possível atualizar a senha. Solicite um novo link e tente novamente.");
                      setRecoveryLoading(false);
                      return;
                    }

                    await supabase.auth.signOut();
                    setFlowMode("default");
                    setNewPassword("");
                    setConfirmNewPassword("");
                    setRecoverySuccessMessage("Senha atualizada com sucesso. Faça login com sua nova senha.");
                    toast.success("Senha redefinida com sucesso.");
                    setRecoveryLoading(false);
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nova senha</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">Confirmar nova senha</Label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={recoveryLoading}>
                    {recoveryLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Atualizando senha...
                      </>
                    ) : (
                      "Salvar nova senha"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    if (!userRole && !isRepresentative) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return <Navigate to={getRedirectByRole(userRole, isRepresentative)} replace />;
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
            <CardDescription>
              Entre com suas credenciais para acessar o painel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRecoveryFlow && (
                <Alert>
                  <AlertDescription>
                    Se você abriu um link de recuperação e esta tela não avançou automaticamente, solicite um novo link de redefinição.
                  </AlertDescription>
                </Alert>
              )}
              {recoverySuccessMessage && (
                <Alert>
                  <AlertDescription>{recoverySuccessMessage}</AlertDescription>
                </Alert>
              )}
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
