# Análise 41 — Fluxo de abertura da cobrança Asaas no checkout público

## 1. Resumo executivo

- **Problema real:** no checkout público (`/public/Checkout`), a implementação abre uma nova aba no clique com `window.open('', '_blank')` para preservar gesto de usuário e reduzir risco de popup blocker, mas essa aba ficava sem conteúdo até a URL da fatura chegar. Resultado: usuário enxerga `about:blank` por alguns segundos.
- **Impacto em UX/conversão:** no mobile (principalmente Safari iPhone), a aba em branco parece travamento/erro, aumenta abandono e reduz confiança no pagamento.
- **Causa raiz identificada:** estratégia atual abre aba vazia **antes** da resposta da edge function `create-asaas-payment` e só depois faz `preOpenedPaymentTab.location.href = checkoutData.url`.
- **Solução recomendada e aplicada:** manter a estratégia de abrir a aba no clique (compatível com popup blocker), mas renderizar imediatamente uma tela intermediária de “Preparando sua cobrança” na própria aba pré-aberta + melhorar feedback na aba atual + fallback manual “Abrir cobrança agora” quando abertura automática for bloqueada.

## 2. Fluxo atual detalhado (antes da correção)

1. Usuário clica em “Continuar para pagamento” no passo 3 de `src/pages/public/Checkout.tsx`.
2. `handleSubmit` valida dados, aceite jurídico e disponibilidade de assentos.
3. O checkout abre nova aba com `window.open('', '_blank')` (aba sem conteúdo).
4. O frontend cria lock de assentos (`seat_locks`), cria `sales`, cria `sale_passengers`.
5. O frontend chama `supabase.functions.invoke('create-asaas-payment', ...)`.
6. A edge function retorna `checkoutData.url` (invoice URL do Asaas).
7. Só então o código direciona a aba aberta para `checkoutData.url`.

**Ponto exato da abertura da aba:** `src/pages/public/Checkout.tsx` em `handleSubmit` (pré-abertura com string vazia).

**Ponto de recebimento da URL:** retorno de `supabase.functions.invoke('create-asaas-payment', ...)` no mesmo `handleSubmit`.

## 3. Causa raiz

- O `about:blank` aparece porque a aba é aberta de propósito com URL vazia e sem conteúdo inicial.
- Esse comportamento era **intencional** da implementação atual para mitigar bloqueio de popup após fluxo assíncrono.
- Diferença entre browsers:
  - **Safari iPhone:** sensação de “tela branca” é mais evidente e troca de abas no mobile piora percepção.
  - **Chrome Android/Desktop:** também ocorre, mas percepção de travamento tende a ser menor.
- Limitação técnica real: abrir aba **somente após** retorno assíncrono aumenta risco de popup blocker (perde vínculo direto com gesto de clique).

## 4. Alternativas possíveis

1. **Abrir aba só com URL final pronta**
   - Prós: elimina `about:blank` sem tela intermediária.
   - Contras: maior risco de popup blocker em mobile/browser restritivo.

2. **Manter usuário na mesma aba e redirecionar depois**
   - Prós: sem nova aba branca.
   - Contras: altera comportamento atual do fluxo e expectativa de retorno/acompanhamento na aba original.

3. **Abrir nova aba com tela intermediária controlada (escolhida)**
   - Prós: preserva mitigação de popup blocker e remove percepção de aba quebrada.
   - Contras: pequena lógica adicional para renderizar estado transitório.

4. **Fallback manual “Abrir cobrança”**
   - Prós: garante continuidade quando bloqueador impede abertura automática.
   - Contras: exige ação extra do usuário em cenário de bloqueio.

## 5. Solução escolhida

### Decisão

Aplicada a alternativa **3 + 4**, pois traz menor mudança de arquitetura e menor risco operacional:

- mantém fluxo existente e contrato atual com `create-asaas-payment`;
- mantém comportamento consistente entre ambientes (sem branch por sandbox/produção);
- reduz fricção mobile eliminando aba em branco sem contexto;
- oferece fallback explícito quando o browser bloquear pop-up.

### Implementação

No `Checkout.tsx`:

- Criada função `renderPaymentPreparingTab(tab)` que escreve HTML mínimo com mensagem humana e spinner na aba recém-aberta.
- `handleSubmit` continua pré-abrindo aba no clique, porém agora renderiza “Preparando sua cobrança” imediatamente.
- Adicionado estado visual no passo 3 da tela atual durante preparação (“Estamos preparando os detalhes da sua cobrança… Não feche esta tela.”).
- Adicionado fallback manual com botão **“Abrir cobrança agora”** quando `window.open` falhar.
- Incluídos logs simples (`console.info`) para observabilidade do momento de geração/abertura.

## 6. Arquivos alterados

- `src/pages/public/Checkout.tsx`
  - Ajuste do fluxo de abertura da aba;
  - tela intermediária na aba pré-aberta;
  - feedback visual no checkout;
  - fallback manual para popup bloqueado;
  - comentários de suporte/documentação no código.

- `analise-41-fluxo-abertura-cobranca-asaas.md`
  - diagnóstico, alternativas e justificativa técnica da solução aplicada.

## 7. Como testar

### Mobile (Safari iPhone e Chrome Android)

1. Entrar no checkout público e ir até passo 3.
2. Clicar em **“Continuar para pagamento”**.
3. Validar que a nova aba abre com mensagem “Preparando sua cobrança” (não mais branco puro).
4. Confirmar redirecionamento automático para a fatura Asaas quando URL chegar.
5. Voltar para aba original e confirmar navegação para `/confirmacao/{sale_id}`.

### Desktop

1. Repetir fluxo do passo 3.
2. Confirmar mesma experiência (tela intermediária e redirecionamento).

### Produção

1. Repetir teste no domínio oficial.
2. Verificar logs de console para rastrear tentativa de abertura e fallback.

### Internet lenta (simulação)

1. Simular Slow 3G/4G no DevTools.
2. Repetir clique de pagamento.
3. Confirmar que durante atraso a aba nova continua com contexto visual (sem parecer travada).
4. Se bloqueio de popup ocorrer, validar CTA manual **“Abrir cobrança agora”**.

## Checklist final da tarefa

- [x] Identificou ponto exato onde a aba em branco é aberta.
- [x] Validou que a URL da cobrança só existe após retorno assíncrono.
- [x] Avaliou risco de popup blocker ao abrir aba apenas no final.
- [x] Implementou feedback visual claro para o usuário.
- [x] Evitou loading sem contexto na aba recém-aberta.
- [x] Adicionou fallback manual para abertura da cobrança.
- [x] Manteve comportamento consistente entre ambientes.
- [x] Comentou o código alterado.
- [x] Gerou arquivo Markdown de análise no padrão solicitado.
