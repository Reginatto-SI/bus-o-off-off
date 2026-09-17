import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PagbankConnectionCard } from './PagbankConnectionCard';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function connectionStatus(overrides = {}) {
  return {
    company_gateway: 'asaas', company_environment: 'sandbox', allowed_environments: ['sandbox'],
    connection: { id: 'connection-a', status: 'connected', environment: 'sandbox', account_masked: 'ACCO_…123', credential_mode: 'connect_oauth', pix_ready: false, split_ready: false, last_validated_at: null, last_error: null },
    capabilities: { auth: 'proven', order: 'unproven', pix: 'unproven', split: 'unproven', card: 'unproven', marketplace_account_configured: true },
    platform_ready: { connect: true, encryption: true, split: true, webhook: true, missing_secret_names: [] },
    ...overrides,
  };
}

function mount(overrides = {}) {
  return render(<MemoryRouter><PagbankConnectionCard
    companyId="company-a" canEdit isDeveloper={false} environment="sandbox"
    asaasStatus={{ label: 'Conectado', className: '' }} asaasConnected asaasPixReady
    developerContent={<p>Diagnóstico interno Asaas</p>} {...overrides}
  ><label>Rascunho Asaas<input aria-label="Rascunho Asaas" /></label><button type="button">Verificar integração Asaas</button></PagbankConnectionCard></MemoryRouter>);
}

afterEach(cleanup);
beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: connectionStatus(), error: null }); });

describe('Company payment presentation', () => {
  it('keeps developer tools out of the regular administrator view', async () => {
    mount();
    await screen.findByText('Conta conectada');
    expect(screen.queryByText(/Área do desenvolvedor/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Token Sandbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Diagnóstico interno Asaas')).not.toBeInTheDocument();
    expect(screen.queryByText('Pagamentos ativos')).not.toBeInTheDocument();
  });

  it('requires explicit confirmation, allows the first Sandbox test without prior Pix proof, and preserves the API contract', async () => {
    invoke.mockImplementation(async (_name, { body }) => ({ data: connectionStatus({ company_gateway: body.action === 'set_gateway' ? 'pagbank' : 'asaas' }), error: null }));
    mount();
    await screen.findByText('Conta conectada');
    fireEvent.click(screen.getByRole('button', { name: 'Usar nas novas vendas' }));
    expect(invoke).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/salva imediatamente/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Usar nas novas vendas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('pagbank-connection', { body: { action: 'set_gateway', company_id: 'company-a', gateway: 'pagbank' } }));
    expect(invoke.mock.calls.every(([name]) => name === 'pagbank-connection')).toBe(true);
  });

  it('blocks PagBank activation in production while keeping account management available', async () => {
    invoke.mockResolvedValue({ data: connectionStatus({ company_environment: 'production' }), error: null });
    mount({ environment: 'production' });
    await screen.findByText('Conta conectada');
    expect(screen.getByRole('button', { name: 'Usar nas novas vendas' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gerenciar Asaas' })).toBeEnabled();
  });

  it('does not infer Asaas selection on status failure and leaves Asaas actions accessible', async () => {
    invoke.mockRejectedValue(new Error('network unavailable'));
    mount();
    await screen.findByText('Não foi possível confirmar');
    expect(screen.queryByText('Selecionado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usar nas novas vendas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar Asaas' }));
    expect(screen.getByRole('button', { name: 'Verificar integração Asaas' })).toBeVisible();
  });

  it('keeps unfinished inputs when switching account details or refreshing status', async () => {
    mount();
    await screen.findByText('Conta conectada');
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar Asaas' }));
    fireEvent.change(screen.getByLabelText('Rascunho Asaas'), { target: { value: 'em edição' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar PagBank' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar situação' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar situação' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar Asaas' }));
    expect(screen.getByLabelText('Rascunho Asaas')).toHaveValue('em edição');
  });

  it('offers developer tools collapsed and validates the manual credential format before saving', async () => {
    mount({ isDeveloper: true });
    await screen.findByText('Conta conectada');
    const summary = screen.getByText('Área do desenvolvedor', { exact: false });
    expect(summary.closest('details')).not.toHaveAttribute('open');
    summary.closest('details')!.setAttribute('open', '');
    screen.getByText('Alternativa de teste: token manual PagBank').closest('details')!.setAttribute('open', '');
    fireEvent.change(screen.getByLabelText('Token Sandbox'), { target: { value: 'sandbox-token-for-test-only' } });
    fireEvent.change(screen.getByLabelText('ID da conta vendedora'), { target: { value: 'email@example.com' } });
    expect(screen.getByRole('button', { name: 'Validar e salvar token' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('ID da conta vendedora'), { target: { value: 'ACCO_test-seller' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar e salvar token' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('pagbank-connection', { body: { action: 'save_sandbox_token', company_id: 'company-a', token: 'sandbox-token-for-test-only', account_id: 'ACCO_test-seller' } }));
    expect(invoke.mock.calls.some(([, { body }]) => body.action === 'set_gateway')).toBe(false);
  });

  it('preserves read-only access without exposing mutation actions', async () => {
    mount({ canEdit: false });
    await screen.findByText('Conta conectada');
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar PagBank' }));
    expect(screen.queryByRole('button', { name: 'Usar nas novas vendas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verificar conexão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desvincular conta' })).not.toBeInTheDocument();
  });

  it('explains the existing Asaas switch and waits for confirmation before disconnecting PagBank', async () => {
    invoke.mockResolvedValue({ data: connectionStatus({ company_gateway: 'pagbank' }), error: null });
    mount();
    await screen.findByText('Conta conectada');
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar PagBank' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desvincular conta' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('voltará a selecionar Asaas');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
