
# Auto-atualizar status do Stripe apos retorno do onboarding

## Resumo

Implementar atualizacao automatica do status da conexao Stripe na guia Pagamentos da tela /admin/empresa. Quando o usuario retorna do onboarding do Stripe, o sistema detecta o retorno e inicia um polling curto para atualizar o status sem necessidade de cliques adicionais.

---

## Mudancas

Todas as mudancas serao feitas em um unico arquivo: `src/pages/admin/Company.tsx`

### 1. Funcao centralizada `refreshStripeStatus`

Extrair a logica de verificacao de status (hoje em `handleCheckStripeStatus`) para uma funcao reutilizavel que:
- Chama a edge function `create-connect-account` com o `company_id`
- Atualiza `capabilitiesReady` e `capabilitiesDetail`
- Recarrega os dados da empresa (`fetchCompany`)
- Retorna `true` se capabilities estiverem ativas

### 2. Auto-refresh ao retornar do Stripe

O `useEffect` que ja detecta `?stripe=complete` nos searchParams (linha 125) sera expandido para:
- Chamar `refreshStripeStatus()` imediatamente ao detectar o parametro
- Iniciar polling automatico (descrito abaixo) se o status ainda nao estiver ativo

### 3. Polling com limite enquanto status pendente

Novo `useEffect` que:
- Ativa quando a empresa tem `stripe_account_id` mas `stripe_onboarding_complete` e `false` (ou `capabilitiesReady` e `false`)
- Executa `refreshStripeStatus()` a cada 3 segundos
- Para automaticamente apos 30 segundos (10 tentativas) ou quando o status mudar para conectado
- Usa `clearInterval` no cleanup para nao vazar ao sair da tela
- Mostra estado visual "Verificando conexao..." durante o polling

### 4. Estado de polling na UI

Novo estado `isPolling` (boolean) para controlar a exibicao visual:
- Quando `isPolling = true`: mostrar spinner + texto "Verificando vinculo com o Stripe..." no lugar do badge de status
- Desabilitar o botao "Conectar Stripe" durante o polling
- Ao terminar o polling (com ou sem sucesso): restaurar UI normal

### 5. Botao manual de fallback

O botao "Verificar status" ja existe (linha 792 e 827). Ajustar para:
- Aparecer tambem quando o status e "Pendente" (nao apenas quando capabilities estao falsas)
- Usar a mesma funcao centralizada `refreshStripeStatus`
- Label: "Atualizar status" quando pendente

### 6. Textos de status atualizados

- Pendente: badge "Pendente" + texto "Estamos aguardando confirmacao do Stripe"
- Conectado: badge "Conectado e Ativo" + texto "Conta Stripe vinculada com sucesso" (ja existe, manter)

---

## Detalhes Tecnicos

### Polling seguro

```text
useEffect:
  - Condicao: company?.stripe_account_id && !capabilitiesReady && editingId
  - Intervalo: 3000ms
  - Maximo: 10 iteracoes (30s)
  - Cleanup: clearInterval ao desmontar ou quando condicao mudar
  - Nao dispara se ja estiver fazendo request (guard com ref)
```

### Funcao centralizada

```text
refreshStripeStatus(companyId: string): Promise<boolean>
  - Chama supabase.functions.invoke('create-connect-account', { body: { company_id } })
  - Atualiza estados: capabilitiesReady, capabilitiesDetail
  - Chama fetchCompany()
  - Retorna capabilities_ready (boolean)
```

### Fluxo completo

```text
1. Usuario clica "Conectar Stripe" -> abre aba do Stripe
2. Usuario completa onboarding -> volta para /admin/empresa?stripe=complete
3. useEffect detecta parametro -> chama refreshStripeStatus()
4. Se ainda pendente -> inicia polling (3s x 10)
5. Polling detecta capabilities ativas -> para polling, atualiza UI
6. Se polling esgotar -> para, mostra botao "Atualizar status" como fallback
```

## Arquivos afetados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/Company.tsx` | Adicionar funcao centralizada, polling com useEffect, estado isPolling, ajustar textos de UI |
