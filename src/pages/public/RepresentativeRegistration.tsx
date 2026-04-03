import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, CheckCircle2, Handshake, Loader2, Megaphone } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhoneForStorage, formatPhoneBR } from '@/lib/phone';
import { useToast } from '@/hooks/use-toast';

interface RegisterRepresentativeResponse {
  success: boolean;
  representative_id?: string;
  user_id?: string;
  error?: string;
}

export default function RepresentativeRegistration() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const emailHint = useMemo(() => {
    if (!email) return 'Use um e-mail que você acessa com frequência.';
    const hasValidShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    return hasValidShape ? 'Tudo certo com esse e-mail.' : 'Formato de e-mail inválido.';
  }, [email]);

  const validate = () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      return 'Preencha todos os campos obrigatórios.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Digite um e-mail válido.';
    if (password.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke<RegisterRepresentativeResponse>(
        'register-representative',
        {
          body: {
            name: name.trim(),
            email: email.trim(),
            phone: normalizePhoneForStorage(phone),
            password,
          },
        },
      );

      if (fnError || !data?.success) {
        const technicalDetail = data?.error || fnError?.message || 'Resposta inesperada da função';
        console.error('[register-representative] Falha no cadastro:', {
          etapa: 'invoke_edge_function',
          funcao: 'register-representative',
          erro: technicalDetail,
        });
        setError('Não foi possível concluir seu cadastro agora. Tente novamente em instantes.');
        setLoading(false);
        return;
      }

      // Integração com auth atual: reutilizamos o login por senha já existente para evitar fluxo paralelo.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        toast({
          title: 'Cadastro concluído',
          description: 'Sua conta foi criada. Faça login para acessar seu painel de representante.',
        });
        navigate('/login');
        setLoading(false);
        return;
      }

      toast({
        title: 'Cadastro concluído! 🎉',
        description: 'Seu painel de representante já está ativo para começar a compartilhar seu link.',
      });

      // Como o AuthContext já identifica representantes por representatives.user_id,
      // o redirecionamento direto para o painel mantém consistência com o login existente.
      navigate('/representante/painel');
    } catch (unknownError) {
      const technicalDetail = unknownError instanceof Error ? unknownError.message : String(unknownError);
      console.error('[register-representative] Erro inesperado:', {
        etapa: 'handleSubmit',
        funcao: 'register-representative',
        erro: technicalDetail,
      });
      setError('Não foi possível concluir seu cadastro agora. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30 py-8 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.16),transparent_64%)]" />

        <div className="relative mx-auto grid w-full max-w-6xl gap-6 px-4 md:grid-cols-2 md:gap-8 sm:px-6 lg:px-8">
          <Card className="border-primary/20 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl md:text-3xl">Seja um representante Smartbus BR</CardTitle>
              <CardDescription className="text-base">
                Indique empresas, compartilhe seu link oficial e acompanhe comissões no seu painel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <Handshake className="mt-0.5 h-4 w-4 text-primary" />
                  Parceria comercial com ativação imediata, sem burocracia para começar.
                </p>
                <p className="flex items-start gap-2">
                  <Megaphone className="mt-0.5 h-4 w-4 text-primary" />
                  Link único de divulgação com rastreabilidade oficial no backend.
                </p>
                <p className="flex items-start gap-2">
                  <BriefcaseBusiness className="mt-0.5 h-4 w-4 text-primary" />
                  Painel dedicado para acompanhar empresas vinculadas e comissões do ledger.
                </p>
              </div>

              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium text-foreground">Começo rápido</p>
                <p className="mt-1 text-muted-foreground">
                  Faça seu cadastro em menos de 1 minuto e acesse o painel automaticamente.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Crie sua conta de representante</CardTitle>
              <CardDescription>
                Informe seus dados básicos para liberar seu acesso e seu link oficial de divulgação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="representative-name">Nome completo *</Label>
                  <Input
                    id="representative-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Como você prefere ser identificado"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="representative-email">E-mail *</Label>
                  <Input
                    id="representative-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@exemplo.com"
                    autoComplete="email"
                    required
                  />
                  <p className="text-xs text-muted-foreground">{emailHint}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="representative-phone">Telefone *</Label>
                  <Input
                    id="representative-phone"
                    value={phone}
                    onChange={(event) => setPhone(formatPhoneBR(event.target.value))}
                    placeholder="(11) 99999-9999"
                    autoComplete="tel"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="representative-password">Senha *</Label>
                  <Input
                    id="representative-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando sua conta...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Criar conta e ativar painel
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Já possui conta?{' '}
                  <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                    Entrar no painel
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
}
