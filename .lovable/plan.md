## Diagnóstico — Retorno do Asaas no SmartBus BR (Android/iOS)

### O que está correto hoje (evidência em código)

**1. Payload do callback — OK**
`supabase/functions/create-asaas-payment/index.ts` linhas 1804‑1816 enviam exatamente:
```json
"callback": { "successUrl": "<URL>/confirmacao/<saleId>?retorno=asaas", "autoRedirect": true }
```
Há log explícito `callback_success_url` (linha 1827) e log `requested` em `sale_integration_logs` com o payload real (linha 1830). Dá para auditar por venda.

**2. URL pública resolvida — OK em produção**
`resolvePublicAppBaseUrl` (linhas 84‑100) lê, nesta ordem: `PUBLIC_APP_URL` → `VITE_PUBLIC_APP_URL` → `APP_BASE_URL`. Se nenhuma estiver setada e o ambiente for `production`, faz fallback hardcoded para `https://www.smartbusbr.com.br` (com `www`). Em sandbox sem env retorna `null` e a edge falha cedo (linhas 1523‑1538, `missing_public_app_url_for_asaas_callback`).

**3. Tela de retorno — OK**
`/confirmacao/:id` já lê `retorno=asaas` (Confirmation.tsx:51) e já tem polling + `verify-payment-status` + reabertura via `get-asaas-payment-link`. Confirmação financeira segue sendo webhook → verify → `finalizeConfirmedPayment`. Nada precisa mudar aí.

**4. invoiceUrl no frontend — usa o link novo da cobrança recém‑criada**
`Checkout.tsx:1765` faz `preOpenedPaymentTab.location.href = checkoutData.url`, ou seja, usa o `invoiceUrl` retornado por `create-asaas-payment` (linha 2052 da edge). Não há reuso de cobrança antiga nesse caminho.

### Causa raiz mais provável do "não volta para o app"

O checkout abre a fatura do Asaas em **nova aba** (`window.open(url, "_blank")` — Checkout.tsx:1302, :1767). Em qualquer experiência tipo app instalado isso é o problema central:

- **PWA standalone / "Adicionar à tela inicial" (iOS Safari, Chrome Android)**: `target="_blank"` sai do contexto standalone e abre no navegador do sistema. O usuário paga lá e o `successUrl` https retorna **no navegador**, não no ícone do app. Parece que "ficou preso no Asaas".
- **TWA Android / WebView**: idem, `_blank` dispara Custom Tabs/navegador externo. Para voltar ao TWA seria preciso ter Digital Asset Links com `www.smartbusbr.com.br` apontando para o package do app.
- **iOS Universal Links**: só funciona se houver `apple-app-site-association` servido em `https://www.smartbusbr.com.br/.well-known/...` apontando para o appID. Senão o https abre no Safari.

Hoje **não existe Capacitor, não existe `android/`, `ios/`, nem `capacitor.config.*` no repositório, e não há `public/manifest.webmanifest`**. Ou seja, no código deste projeto não há nenhum app nativo nem PWA instalável configurado. Se há "app nas lojas", ele foi gerado fora deste repositório (provavelmente um TWA/WebView wrapper) e o vínculo de domínio precisa ser configurado lá, não aqui.

### Painel do Asaas

O `successUrl` do callback aceita qualquer https público válido por cobrança — não exige cadastro prévio. O campo "site" da conta Asaas é informativo/compliance, não restringe o domínio do callback. Mesmo assim, recomendação: padronizar **tudo em `https://www.smartbusbr.com.br`** (com `www`) — código já faz isso; só garantir que o painel Asaas, a env `PUBLIC_APP_URL` e o domínio cadastrado nas lojas usem a mesma forma. `smartbusbr.com.br` sem `www` cria cookie/origem diferente e quebra qualquer tentativa futura de Universal Link / Asset Links.

### Respostas diretas

| Pergunta | Resposta |
|---|---|
| Callback chega ao Asaas? | Sim, com `autoRedirect:true`. Confirmar nos logs `callback_success_url` e em `sale_integration_logs` (stage `requested`). |
| Domínio do callback correto? | Sim, `https://www.smartbusbr.com.br/confirmacao/{saleId}?retorno=asaas` em produção. |
| Bate com o painel Asaas? | Asaas não valida o successUrl contra o "site" da conta. Padronizar mesmo assim. |
| Configuração manual obrigatória no painel? | Não para o redirect funcionar. Sim para boa prática (campo site = `https://www.smartbusbr.com.br`). |
| invoiceUrl novo ou antigo? | Novo a cada checkout. Reabertura usa `get-asaas-payment-link`. |
| Adicionar `autoRedirect=true` ao invoiceUrl? | Opcional. Útil só quando reabrindo cobrança já paga. Se for fazer, usar concatenação segura (`?` vs `&`). Baixo impacto. |
| HTTPS volta para dentro do app? | **Não automaticamente**. Depende de App Links (Android) / Universal Links (iOS) / scope do PWA. |
| Android precisa de App Links/TWA? | Sim. Digital Asset Links em `https://www.smartbusbr.com.br/.well-known/assetlinks.json` apontando para o package + SHA‑256 da chave de assinatura do app. |
| iOS precisa de Universal Links? | Sim. `apple-app-site-association` em `https://www.smartbusbr.com.br/.well-known/apple-app-site-association` (JSON, content-type correto, sem extensão) com o Team ID + bundle ID. |
| Ajuste mínimo recomendado? | Ver abaixo. |

### Ajuste mínimo recomendado (sem mudar regra financeira)

1. **No checkout, parar de abrir o Asaas em nova aba quando estiver em contexto standalone/WebView**. Detectar `window.matchMedia('(display-mode: standalone)').matches`, `navigator.standalone` (iOS), ou user-agent do wrapper, e nesses casos navegar com `window.location.assign(checkoutData.url)` na mesma "aba". Assim o `autoRedirect` do Asaas devolve o usuário no mesmo contexto e ele cai em `/confirmacao/:id?retorno=asaas` dentro do app.
2. **Garantir env `PUBLIC_APP_URL=https://www.smartbusbr.com.br` em produção** (a edge já tem fallback, mas explícito evita acidentes).
3. **No app instalado (fora deste repo)**:
   - **Android (TWA)**: publicar `/.well-known/assetlinks.json` com o package e SHA‑256 do app. Sem isso, `_blank` continua indo para Chrome.
   - **iOS**: publicar `/.well-known/apple-app-site-association` com `applinks` cobrindo `/confirmacao/*` e `/eventos/*`. Sem isso, https abre no Safari.
4. **(Opcional)** Adicionar `?autoRedirect=true`/`&autoRedirect=true` ao `invoiceUrl` ao reabrir cobrança em `/confirmacao` para acelerar o retorno em cobrança já paga.
5. **Nada muda em**: webhook, verify-payment-status, finalizeConfirmedPayment, split, criação de tickets, venda manual.

### Testes a executar

- Android Chrome (PWA "Adicionar à tela inicial"): pagar Pix → confirmar que volta em `/confirmacao/...?retorno=asaas` no mesmo contexto.
- Android, app da loja (TWA): repetir; confirmar `assetlinks.json` retornando 200 com content-type `application/json`.
- iOS Safari standalone: repetir; verificar se o retorno fica no PWA ou cai no Safari.
- iOS, app da loja: repetir; validar `apple-app-site-association` via `curl -I` (sem extensão, sem redirect, sem `Content-Type: text/html`).
- Em todos: conferir `sale_integration_logs` da venda (stage `requested`) → confirmar `callback.successUrl` exato; conferir log da edge `callback_success_url`.

### Critério de aceite

Quando o item 1 (mesma aba em standalone/WebView) + os arquivos `.well-known` estiverem no ar, o usuário paga e cai em `/confirmacao/:saleId?retorno=asaas` dentro do app; se a venda já estiver `pago` com tickets, vê a passagem digital com QR Code; webhook continua sendo a fonte da verdade financeira.

### Próximo passo

Confirmar comigo se posso implementar **apenas o item 1** (detecção de standalone/WebView no `Checkout.tsx` para usar `location.assign` em vez de `window.open` nesses contextos) — é a única mudança de código deste repositório. Os arquivos `.well-known` e o vínculo Android/iOS são configuração de domínio/loja, fora deste codebase.