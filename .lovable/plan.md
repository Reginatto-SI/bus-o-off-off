## Diagnóstico (causa provável)

Hoje, em contexto de app instalado/PWA/TWA/WebView, o `Checkout.tsx` faz `window.location.assign(asaasInvoiceUrl)` (linha 1777). Isso **substitui a janela do app pela página do Asaas**. A partir desse momento:

- Pix pago em **outro celular** → o Asaas no celular original só atualiza por polling interno; o `autoRedirect` só dispara quando a página do Asaas detecta `RECEIVED`. Em muitos cenários reais (Pix copiado/cobrança em outro device), o `autoRedirect` nunca acontece de forma confiável → usuário fica "preso na tela do Asaas".
- Se o usuário fecha o Asaas com "voltar", em TWA/PWA standalone o app já tinha sido substituído pela URL externa, então o "voltar" leva ao histórico do navegador, não à tela de confirmação.

A tela `/confirmacao/:saleId` **já faz o certo** quando recebe o usuário: prioriza tickets (Confirmation.tsx:630‑638, 720‑738), faz polling 3s, chama `verify-payment-status` a cada ~30s, e tem fallback de recarga de tickets em pago. O problema é estrutural: o usuário não está nessa tela enquanto paga.

## Decisão de UX (sua pergunta direta)

**Opção A — passagem no topo da própria `/confirmacao/:saleId` (sem modal).** Mais segura para PWA/WebView/iOS standalone, onde modais e `window.open` automáticos têm comportamento inconsistente, podem ser bloqueados ou aparecer fora do contexto do app. A tela já está estruturada para isso. Não introduzir modal automático.

## Mudança principal (fluxo)

Trocar a estratégia em **app instalado/PWA/WebView** de "navegar a janela do app para o Asaas" para "navegar a janela do app para `/confirmacao/:saleId?retorno=asaas` e abrir o Asaas em janela auxiliar":

```text
Antes (app instalado):
  [App] -- assign(asaasInvoiceUrl) --> [Asaas no lugar do app]
  Pix pago em outro device → autoRedirect incerto → preso

Depois (app instalado):
  [App] -- assign(/confirmacao/:saleId?retorno=asaas) --> [App na tela de confirmação, polling ativo]
                                                              |
                                                              +-- window.open(asaasInvoiceUrl) --> [Custom Tab/Safari View]
  Pix pago em qualquer device → /confirmacao detecta pago → passagem aparece no topo
  Usuário fechar a Custom Tab cai direto na /confirmacao (app continua vivo)
```

Em navegador comum (não-app), manter o comportamento atual (nova aba pré-aberta).

## Arquivos a alterar

1. **`src/pages/public/Checkout.tsx`**
   - Em `isInstalledAppContext === true` (linha 1774‑1777), em vez de `window.location.assign(asaasInvoiceUrl)`:
     - `window.open(asaasInvoiceUrl, '_blank', 'noopener')` (vira Custom Tab no TWA, Safari View no iOS standalone). Se `open` retornar `null`, fazer fallback para `location.assign` (comportamento antigo).
     - Em seguida, `window.location.assign('/confirmacao/' + sale.id + '?retorno=asaas')` para deixar o app na tela de confirmação com polling ativo desde já.
   - Atualizar `logAsaasInvoiceOpen` com `navigation_strategy: 'app_confirmation_plus_invoice_tab'` (e fallback `same_window_assign`).
   - Nenhuma mudança no fluxo de navegador comum (preOpened tab continua como está).

2. **`src/pages/public/Confirmation.tsx`** (apenas reforços, sem regra financeira)
   - Adicionar logs estruturados sem dados sensíveis: `[confirmation] mount`, `[confirmation] tickets_loaded` com `{ sale_id, retorno, sale_status, tickets_count, payment_method }`; `[confirmation] paid_no_tickets_retry { attempt }`; `[confirmation] reload_tickets_error`.
   - Quando `isAsaasReturn && !isPaid`, encurtar o intervalo de polling de 3s → 2s nos primeiros 30s (só nesse cenário), depois volta a 3s. Mantém timeout total de 6 min.
   - Botão "Atualizar passagem" já existe (linha 649‑661) quando `paidTicketReloadTimedOut`. Adicionar também um botão secundário "Reabrir cobrança Asaas" no estado "pago sem tickets ainda" caso o usuário queira reconferir lá (reutiliza `handleReopenAsaasInvoice`, já existente).
   - Garantir que, em `isPaid && ticketCards.length > 0`, o bloco de tickets (linha 721‑738) renderize **antes** do header de status (já está logicamente correto via fluxo do JSX, mas confirmar que o `<div className="text-center mb-8">` do header de "Sua passagem digital" + os cards juntos formam a primeira tela visível — sem precisar de scroll em mobile). Caso necessário, reduzir paddings no header em mobile.

3. **`src/lib/asaasInvoiceUrl.ts`**
   - Estender `logAsaasInvoiceOpen` aceitando `'app_confirmation_plus_invoice_tab'` no union de `navigationStrategy`.

## O que NÃO muda (regra crítica)

- Webhook Asaas, `verify-payment-status`, `finalizeConfirmedPayment`, split, criação de tickets, venda manual, `externalReference`, tabelas do banco, status de venda.
- Nenhuma criação de ticket no frontend. Polling só consulta.
- `?retorno=asaas` continua sendo apenas contexto de UX.

## Por que essa abordagem é a mais segura em mobile

- **App nunca é "abandonado"**: a tela do app fica em `/confirmacao` com polling ativo desde o segundo seguinte ao clique em "Pagar". Mesmo se o Asaas não disparar `autoRedirect` (caso comum de Pix pago em outro device), o app já detecta `pago` por conta própria e troca para a passagem digital.
- **Custom Tabs/Safari View** preservam o app em segundo plano. Fechar a aba do gateway devolve o usuário automaticamente à tela de confirmação — sem precisar "apertar voltar várias vezes".
- **Sem modal automático**: modais auto-abertos em PWA standalone/WebView têm histórico de bloqueio, foco perdido, e em iOS standalone podem fechar a stack. Passagem no topo da tela é nativamente confiável.

## Testes manuais

### Android (PWA instalado + TWA da loja)
1. Comprar passagem, escolher Pix.
2. Confirmar que o app navega para `/confirmacao/:id?retorno=asaas` e o Asaas abre em Custom Tab por cima.
3. Pagar Pix em **outro celular**.
4. Voltar para a Custom Tab → autoRedirect ou fechar manualmente. Confirmar que cai em `/confirmacao` já com passagem no topo (ou com "carregando passagem" e depois passagem).
5. Repetir com cartão.

### iOS (PWA Adicionar à Tela + TWA wrapper)
1. Repetir os passos. A aba auxiliar abre como Safari View Controller.
2. Validar que fechar o Safari View devolve direto para o app na `/confirmacao`.
3. Confirmar que **não** aparece modal automático.

### Navegador comum (Chrome desktop, Safari desktop)
1. Confirmar que o comportamento antigo (nova aba pré-aberta com "Preparando sua cobrança", aba original em `/confirmacao`) continua igual.

### Logs (DevTools → Console)
- `[asaas] open_invoice { navigation_strategy: 'app_confirmation_plus_invoice_tab', has_auto_redirect: true, ... }` no clique de pagar (app instalado).
- `[confirmation] mount { sale_id, retorno: 'asaas', sale_status, payment_method }`.
- `[confirmation] polling:trigger_verify_payment_status` a cada ~20‑30s.
- `[confirmation] tickets_loaded { tickets_count > 0 }` quando passagem renderiza.

## Critério de aceite

- Em app instalado, após pagar Pix/cartão no Asaas, o usuário volta automaticamente (autoRedirect) **ou** ao fechar a Custom Tab cai em `/confirmacao/:saleId?retorno=asaas` dentro do app.
- Se `sales.status='pago'` e existem `tickets`, a passagem digital com QR Code é a primeira coisa visível na tela.
- Se `pago` sem tickets ainda, mensagem "Pagamento confirmado. Estamos carregando sua passagem digital." + retry automático + botão "Atualizar passagem" no timeout.
- Se ainda processando, tela explica claramente e segue tentando.
- Nenhuma regra financeira muda; webhook + verify continuam fontes únicas de verdade.

## Próximo passo

Confirmar para eu implementar exatamente os 3 arquivos acima.