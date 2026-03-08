

## Plano: Exibir status do Pix na aba Pagamentos da Empresa

### Situação atual

Hoje o status do Pix **não é mostrado em nenhuma tela fixa**. O aviso só aparece como um toast temporário quando o admin tenta criar um checkout (venda manual ou taxa da plataforma) e o Pix falha. Na aba "Pagamentos" da empresa, o sistema mostra apenas se o Stripe está "Conectado e ativo" com base nas capabilities `transfers` e `card_payments`, mas não verifica se o Pix está habilitado.

### Solução

Adicionar uma verificação de Pix na edge function `create-connect-account` (que já é chamada pelo botão "Verificar status") e exibir o resultado visualmente na aba Pagamentos.

### Alterações

**1. Edge Function `create-connect-account/index.ts`**
- Após verificar capabilities (`transfers`, `card_payments`), adicionar verificação do Pix
- Usar `stripe.paymentMethods.list` ou tentar criar uma sessão de teste para detectar se Pix está ativo na conta conectada
- Alternativa mais simples e confiável: consultar `account.capabilities` para verificar se existe capability de Pix (campo `pix_payments` ou similar) na conta conectada
- Retornar no JSON de resposta um campo `pix_enabled: boolean`

**2. Frontend `src/pages/admin/Company.tsx`**
- Adicionar estado `pixEnabled` (boolean | null)
- Atualizar `refreshStripeStatus` e `handleConnectStripe` para capturar `pix_enabled` da resposta
- Na seção "Conectado e ativo", abaixo do texto existente, adicionar um badge/indicador:
  - Se `pixEnabled === true`: Badge verde "Pix habilitado"
  - Se `pixEnabled === false`: Badge âmbar "Pix não habilitado" + texto orientativo: "Para habilitar Pix, acesse Settings → Payment Methods no Dashboard do Stripe da sua conta."
  - Se `pixEnabled === null`: não exibir nada (ainda não verificou)

### Comportamento esperado

- Admin clica em "Verificar status" → sistema consulta Stripe → exibe se Pix está habilitado ou não
- Se não estiver habilitado, mostra orientação clara de como ativar
- Nenhuma mudança no fluxo público ou de checkout

### Risco / limitação

O Stripe pode não expor a capability de Pix diretamente via API para contas Express. Nesse caso, a alternativa é fazer uma tentativa de criar um PaymentIntent com `payment_method_types: ['pix']` e verificar se retorna erro — mesma lógica de fallback que já usamos no checkout, mas como verificação diagnóstica.

