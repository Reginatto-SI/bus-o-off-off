# Relatório — Badge de Ambiente Sandbox no Header

## 1. Resumo executivo

Foi implementada uma badge discreta com o texto **Sandbox** no header administrativo, exibida **somente** quando o ambiente operacional atual é sandbox. A UI não usa heurística própria: o frontend consulta um endpoint backend que reutiliza a mesma função oficial (`resolveEnvironmentFromHost`) já usada no fluxo Asaas para decidir o ambiente inicial das novas operações financeiras.

Isso torna a badge confiável como indicador operacional: quando a API decidir que novas cobranças nascem em sandbox, a badge aparece; em produção, nada é renderizado.

## 2. Lógica usada

A regra reaproveitada é a função compartilhada de backend:

- `resolveEnvironmentFromHost(req)` em `supabase/functions/_shared/runtime-env.ts`
- Regra oficial: hosts de produção (`smartbusbr.com.br` e `www.smartbusbr.com.br`) => `production`; qualquer outro host => `sandbox`.

Para não duplicar essa lógica no frontend, foi criada a edge function `get-runtime-payment-environment`, que apenas expõe o resultado da função compartilhada. O header consome esse valor e renderiza a badge somente para `sandbox`.

## 3. Arquivos alterados

- `supabase/functions/get-runtime-payment-environment/index.ts`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/components/layout/AdminHeader.tsx`

## 4. Comportamento final

- Ambiente atual = `sandbox` → badge **Sandbox** aparece no header.
- Ambiente atual = `production` → nenhuma badge é exibida.

Produção não mostra nada por decisão explícita de UX e de contrato funcional, evitando ruído visual e mantendo a indicação apenas para o estado de atenção (sandbox).

## 5. Observações técnicas

- A implementação é somente de leitura/indicador visual; não altera regras de pagamento nem o backend transacional.
- Em caso de falha da consulta frontend ao endpoint (ex.: function ainda não publicada no projeto remoto), o hook aplica fallback pela mesma regra oficial por host, mantendo coerência com o contrato sandbox/produção.
- Se no futuro existir toggle/manual override oficial no backend, a badge deve continuar refletindo a **fonte única oficial** (resolvedor backend), sem lógica paralela no frontend.
