import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';

const mock = vi.hoisted(() => ({
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  query: vi.fn(),
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    onAuthStateChange: (listener: typeof mock.listener) => {
      mock.listener = listener;
      return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
    },
    getSession: mock.getSession,
  },
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: (key: string, value: unknown) => { filters[key] = value; return query; },
      single: () => query,
      maybeSingle: () => query,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(mock.query(table, filters)).then(resolve, reject),
    };
    return query;
  },
} }));
vi.mock('@/components/layout/AdminSidebar', () => ({ AdminSidebar: () => null }));
vi.mock('@/components/layout/AdminHeader', () => ({ AdminHeader: () => null }));

const company = { id: 'company-a', name: 'Empresa A', is_active: true };
const otherCompany = { id: 'company-b', name: 'Empresa B', is_active: true };
const sessionFor = (id = 'user-a', token = 'token-1') => ({ user: { id }, access_token: token } as Session);
const defaultQuery = (table: string, filters: Record<string, unknown>) => ({
  data: table === 'profiles' ? { id: filters.id }
    : table === 'user_roles' ? [{ company_id: company.id, role: 'developer', seller_id: null }]
    : table === 'companies' ? [company, otherCompany] : null,
  error: null,
});
function Draft() {
  const [value, setValue] = useState('');
  return <input aria-label="Rascunho" value={value} onChange={event => setValue(event.target.value)} />;
}
function Probe() {
  const auth = useAuth();
  return <>
    <output data-testid="auth">{JSON.stringify({ loading: auth.loading, user: auth.user?.id,
      role: auth.userRole, company: auth.activeCompanyId, token: auth.session?.access_token })}</output>
    <button onClick={() => void auth.switchCompany(otherCompany.id)}>Trocar empresa</button>
    <AdminLayout><Draft /></AdminLayout>
  </>;
}
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter>
  </QueryClientProvider>);
}
async function emit(event: AuthChangeEvent, session: Session | null = sessionFor()) {
  await act(async () => { mock.listener!(event, session); });
}
async function login() {
  await emit('INITIAL_SESSION');
  await screen.findByRole('textbox', { name: 'Rascunho' });
}
const auth = () => JSON.parse(screen.getByTestId('auth').textContent!);
const deferred = () => {
  let resolve!: (value: ReturnType<typeof defaultQuery>) => void;
  const promise = new Promise<ReturnType<typeof defaultQuery>>(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mock.query.mockImplementation(defaultQuery);
  mock.getSession.mockResolvedValue({ data: { session: sessionFor() } });
});
afterEach(cleanup);

describe('AuthProvider: preservação de formulários durante revalidação', () => {
  it.each(['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'] as AuthChangeEvent[])(
    'preserva o mesmo input e o rascunho durante %s, atualizando a sessão', async event => {
      mount();
      await login();
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'cadastro em andamento' } });
      mock.query.mockClear();
      const pending = deferred();
      mock.query.mockImplementation((table, filters) => table === 'profiles' ? pending.promise : defaultQuery(table, filters));
      await emit(event, sessionFor('user-a', 'token-renovado'));
      expect(auth()).toMatchObject({ loading: false, token: 'token-renovado' });
      expect(screen.getByRole('textbox')).toBe(input);
      expect(input).toHaveValue('cadastro em andamento');
      await waitFor(() => expect(mock.query).toHaveBeenCalledWith('profiles', { id: 'user-a' }));
      await act(async () => { pending.resolve(defaultQuery('profiles', { id: 'user-a' })); });
      await waitFor(() => expect(mock.query).toHaveBeenCalledWith('companies', expect.anything()));
      expect(screen.getByRole('textbox')).toBe(input);
      expect(input).toHaveValue('cadastro em andamento');
    });

  it('mantém o loader inicial e agrupa eventos enquanto os dados ainda estão pendentes', async () => {
    const pending = deferred();
    mock.query.mockImplementation((table, filters) => table === 'profiles' ? pending.promise : defaultQuery(table, filters));
    mount();
    await emit('INITIAL_SESSION');
    await waitFor(() => expect(mock.query).toHaveBeenCalled());
    await emit('SIGNED_IN');
    await emit('TOKEN_REFRESHED');
    expect(auth().loading).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(mock.query.mock.calls.filter(([table]) => table === 'profiles')).toHaveLength(1);
    await act(async () => { pending.resolve(defaultQuery('profiles', { id: 'user-a' })); });
    await screen.findByRole('textbox');
  });

  it('descarta respostas de revalidação recebidas após logout ou expiração', async () => {
    mount();
    await login();
    const pending = deferred();
    mock.query.mockImplementation((table, filters) => table === 'profiles' ? pending.promise : defaultQuery(table, filters));
    await emit('TOKEN_REFRESHED');
    await waitFor(() => expect(mock.query.mock.calls.filter(([table]) => table === 'profiles')).toHaveLength(2));
    await emit('SIGNED_OUT', null);
    await act(async () => { pending.resolve(defaultQuery('profiles', { id: 'user-a' })); });
    expect(auth()).toMatchObject({ loading: false, company: null, role: null });
    expect(auth().user).toBeUndefined();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('bloqueia uma nova identidade e impede que respostas do usuário anterior a sobrescrevam', async () => {
    mount();
    await login();
    const oldRequest = deferred();
    const newRequest = deferred();
    mock.query.mockImplementation((table, filters) => table === 'profiles'
      ? (filters.id === 'user-a' ? oldRequest.promise : newRequest.promise) : defaultQuery(table, filters));
    await emit('SIGNED_IN');
    await waitFor(() => expect(mock.query.mock.calls.filter(([table]) => table === 'profiles')).toHaveLength(2));
    await emit('SIGNED_IN', sessionFor('user-b'));
    expect(auth()).toMatchObject({ loading: true, user: 'user-b', company: null, role: null });
    await act(async () => { oldRequest.resolve(defaultQuery('profiles', { id: 'user-a' })); });
    expect(auth().loading).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
    await act(async () => { newRequest.resolve(defaultQuery('profiles', { id: 'user-b' })); });
    await screen.findByRole('textbox');
    expect(auth().user).toBe('user-b');
  });

  it('continua revalidando alterações de permissão do mesmo usuário', async () => {
    mount();
    await login();
    mock.query.mockImplementation((table, filters) => table === 'user_roles'
      ? { data: [{ company_id: company.id, role: 'vendedor' }], error: null } : defaultQuery(table, filters));
    await emit('SIGNED_IN');
    await waitFor(() => expect(auth().role).toBe('vendedor'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('preserva a empresa selecionada ao revalidar a sessão', async () => {
    mount();
    await login();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar empresa' }));
    await waitFor(() => expect(auth().company).toBe(otherCompany.id));
    mock.query.mockClear();
    await emit('SIGNED_IN');
    await waitFor(() => expect(mock.query).toHaveBeenCalledWith('companies', expect.anything()));
    expect(auth().company).toBe(otherCompany.id);
  });

  it('ignora getSession vazio atrasado quando o login já começou', async () => {
    let resolveSession!: (value: unknown) => void;
    mock.getSession.mockReturnValue(new Promise(resolve => { resolveSession = resolve; }));
    const pending = deferred();
    mock.query.mockImplementation(() => pending.promise);
    mount();
    await emit('SIGNED_IN');
    await act(async () => { resolveSession({ data: { session: null } }); });
    expect(auth().loading).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
