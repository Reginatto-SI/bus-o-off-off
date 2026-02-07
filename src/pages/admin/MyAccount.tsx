import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/admin/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';

interface ProfileFormData {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface ProfileFormErrors {
  name?: string;
  cpf?: string;
  phone?: string;
  cep?: string;
  state?: string;
}

const formatCpfInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCepInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export default function MyAccount() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [form, setForm] = useState<ProfileFormData>({
    name: '',
    email: '',
    phone: '',
    cpf: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  });
  const [initialForm, setInitialForm] = useState<ProfileFormData | null>(null);

  const initials = useMemo(() => {
    const baseName = form.name || profile?.name || '';
    const parts = baseName.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'US';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [form.name, profile?.name]);

  const hydrateForm = (data: ProfileFormData) => {
    setForm(data);
    setInitialForm(data);
    setErrors({});
  };

  const fetchProfile = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('name, email, phone, cpf, cep, street, number, complement, neighborhood, city, state')
      .eq('id', user.id)
      .single();

    if (error) {
      logSupabaseError({
        label: 'Erro ao carregar perfil (profiles.select)',
        error,
        context: { action: 'select', table: 'profiles', userId: user.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao carregar perfil',
          error,
          context: { action: 'select', table: 'profiles', userId: user.id },
        })
      );
      setLoading(false);
      return;
    }

    const hydrated: ProfileFormData = {
      name: data?.name ?? '',
      email: data?.email ?? '',
      phone: formatPhoneInput(data?.phone ?? ''),
      cpf: formatCpfInput(data?.cpf ?? ''),
      cep: formatCepInput(data?.cep ?? ''),
      street: data?.street ?? '',
      number: data?.number ?? '',
      complement: data?.complement ?? '',
      neighborhood: data?.neighborhood ?? '',
      city: data?.city ?? '',
      state: (data?.state ?? '').toUpperCase(),
    };

    hydrateForm(hydrated);
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, [user?.id]);

  const resetForm = () => {
    if (initialForm) {
      setForm(initialForm);
    }
    setErrors({});
  };

  const validateForm = () => {
    const nextErrors: ProfileFormErrors = {};
    if (!form.name.trim()) {
      nextErrors.name = 'Informe seu nome completo.';
    }

    const cpfDigits = form.cpf.replace(/\D/g, '');
    if (cpfDigits && cpfDigits.length !== 11) {
      nextErrors.cpf = 'CPF inválido.';
    }

    const phoneDigits = form.phone.replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length < 10) {
      nextErrors.phone = 'Telefone inválido.';
    }

    const cepDigits = form.cep.replace(/\D/g, '');
    if (cepDigits && cepDigits.length !== 8) {
      nextErrors.cep = 'CEP inválido.';
    }

    if (form.state && form.state.length !== 2) {
      nextErrors.state = 'UF deve ter 2 letras.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      toast.error('Usuário não autenticado.');
      return;
    }

    if (!validateForm()) {
      toast.error('Corrija os campos destacados para salvar.');
      return;
    }

    setSaving(true);

    const normalizedCpf = form.cpf.replace(/\D/g, '');
    const normalizedPhone = form.phone.replace(/\D/g, '');
    const normalizedCep = form.cep.replace(/\D/g, '');

    // Comentário: atualização limitada ao próprio usuário, respeitando RLS/tenant.
    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim(),
        phone: normalizedPhone || null,
        cpf: normalizedCpf || null,
        cep: normalizedCep || null,
        street: form.street.trim() || null,
        number: form.number.trim() || null,
        complement: form.complement.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim().toUpperCase() || null,
      })
      .eq('id', user.id);

    if (error) {
      logSupabaseError({
        label: 'Erro ao salvar perfil (profiles.update)',
        error,
        context: { action: 'update', table: 'profiles', userId: user.id },
      });
      toast.error(
        buildDebugToastMessage({
          title: 'Erro ao salvar alterações',
          error,
          context: { action: 'update', table: 'profiles', userId: user.id },
        })
      );
      setSaving(false);
      return;
    }

    const updatedForm: ProfileFormData = {
      ...form,
      cpf: formatCpfInput(normalizedCpf),
      phone: formatPhoneInput(normalizedPhone),
      cep: formatCepInput(normalizedCep),
      state: form.state.trim().toUpperCase(),
    };

    hydrateForm(updatedForm);
    toast.success('Alterações salvas com sucesso.');
    setSaving(false);
  };

  const handleSendResetLink = async () => {
    if (!user?.email) {
      toast.error('Não foi possível identificar seu e-mail.');
      return;
    }

    // Comentário: utiliza fluxo oficial do Supabase Auth para redefinição de senha.
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      logSupabaseError({
        label: 'Erro ao enviar link de redefinição (auth.resetPasswordForEmail)',
        error,
        context: { action: 'resetPasswordForEmail', userId: user.id },
      });
      toast.error('Não foi possível enviar o link de redefinição. Tente novamente.');
      return;
    }

    toast.success('Enviamos um link para seu e-mail.');
    setPasswordDialogOpen(false);
  };

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 space-y-6">
        <PageHeader
          title="Minha Conta"
          description="Gerencie seus dados pessoais e segurança"
          actions={
            <Avatar className="h-12 w-12 border border-border">
              <AvatarFallback className="bg-muted text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          }
        />

        {loading ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              {/* Comentário: layout responsivo compacto (1 col mobile, 2 col md, 3 col desktop). */}
              <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              {/* Comentário: layout responsivo compacto (1 col mobile, 2 col md, 3 col desktop). */}
              <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Perfil</CardTitle>
                <CardDescription>Atualize seus dados básicos de contato.</CardDescription>
              </CardHeader>
              {/* Comentário: layout responsivo compacto (1 col mobile, 2 col md, 3 col desktop). */}
              <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: formatPhoneInput(event.target.value) })
                    }
                  />
                  {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    value={form.cpf}
                    onChange={(event) => setForm({ ...form, cpf: formatCpfInput(event.target.value) })}
                  />
                  {errors.cpf && <p className="text-sm text-destructive">{errors.cpf}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" value={form.email} readOnly className="bg-muted" />
                  <p className="text-xs text-muted-foreground">
                    Este é seu login e não pode ser alterado aqui.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Endereço</CardTitle>
                <CardDescription>Se preferir, mantenha seus dados de entrega atualizados.</CardDescription>
              </CardHeader>
              {/* Comentário: ordem lógica e grid compacto para reduzir rolagem no desktop. */}
              <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={form.cep}
                    onChange={(event) => setForm({ ...form, cep: formatCepInput(event.target.value) })}
                  />
                  {errors.cep && <p className="text-sm text-destructive">{errors.cep}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="street">Rua/Logradouro</Label>
                  <Input
                    id="street"
                    value={form.street}
                    onChange={(event) => setForm({ ...form, street: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input
                    id="number"
                    value={form.number}
                    onChange={(event) => setForm({ ...form, number: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro</Label>
                  <Input
                    id="neighborhood"
                    value={form.neighborhood}
                    onChange={(event) => setForm({ ...form, neighborhood: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(event) => setForm({ ...form, city: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">UF</Label>
                  <Input
                    id="state"
                    value={form.state}
                    onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })}
                    maxLength={2}
                  />
                  {errors.state && <p className="text-sm text-destructive">{errors.state}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="complement">Complemento</Label>
                  <Input
                    id="complement"
                    value={form.complement}
                    onChange={(event) => setForm({ ...form, complement: event.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Segurança</CardTitle>
                <CardDescription>Proteja seu acesso e credenciais de login.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Senha</p>
                  <p className="text-sm text-muted-foreground">••••••••</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                  Alterar senha
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        )}
      </div>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Para sua segurança, prefira receber um link de redefinição no e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button className="w-full" onClick={handleSendResetLink}>
              Enviar link de redefinição para meu e-mail
            </Button>
            <Button className="w-full" variant="outline" disabled>
              Trocar senha agora (em breve)
            </Button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Fechar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
