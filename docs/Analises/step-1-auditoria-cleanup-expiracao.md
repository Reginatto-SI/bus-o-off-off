# Step 1 — Auditoria do cleanup automático de expiração

## 1. Resumo executivo

### Veredito do Step 1
- **Job registrado no ambiente atual:** **não foi possível comprovar diretamente**.
- **Job habilitado:** **não foi possível comprovar diretamente**.
- **Job executando de fato:** **não foi possível comprovar diretamente com prova forte**.
- **Edge Function existente e compatível com chamada automática:** **sim, com prova forte no código**.
- **Evidências recentes de execução automática:** **apenas indiretas e insuficientes para confiança plena**.
- **Confiabilidade atual do mecanismo:** **parcial**.

### Síntese técnica
A implementação central existe e está claramente definida em uma Edge Function chamada `cleanup-expired-locks`, acompanhada de migration que agenda um job `cleanup-expired-locks-every-1-minute` via `pg_cron` + `net.http_post`. No entanto, nesta auditoria **não houve acesso suficiente para consultar diretamente `cron.job`, `cron.job_run_details` ou logs nativos das Edge Functions**, então **não foi possível provar de forma forte** que o agendamento está hoje registrado, habilitado e executando no ambiente atual.

As consultas read-only no banco mostraram que, no escopo acessível ao usuário auditado:
- não existem vendas `pendente_pagamento` antigas (>15 min);
- existem **18 vendas `reservado` antigas**;
- não existem `seat_locks` ativos nem expirados visíveis neste momento;
- existem logs históricos de `auto_cancelled`, mas eles não batem com a descrição textual atual da implementação de `cleanup-expired-locks`, o que enfraquece a prova operacional de que o job atual esteja rodando agora.

### Classificação da evidência
- **Prova forte:** existência da implementação, desenho do fluxo, compatibilidade do endpoint com cron, regra baseada em `seat_locks.expires_at`.
- **Evidência indireta:** histórico de cancelamentos automáticos antigos em `sale_logs`.
- **Não foi possível comprovar:** registro atual do job, habilitação atual, últimas execuções atuais e logs nativos recentes da Edge Function.

## 2. Implementação encontrada

### 2.1 Edge Function principal
**Arquivo:** `supabase/functions/cleanup-expired-locks/index.ts`

**Ponto de entrada:** `serve(async (req) => { ... })`

**Responsabilidades implementadas:**
1. ler `seat_locks` com `expires_at < now`;
2. extrair `sale_id` candidatos;
3. revalidar se ainda há lock ativo para a venda;
4. cancelar vendas elegíveis ainda em `pendente_pagamento`;
5. registrar `sale_logs` com `action = auto_cancelled`;
6. limpar `sale_passengers` da venda cancelada;
7. apagar `seat_locks` expirados.

### 2.2 Arquivos relacionados
- `supabase/migrations/20261016090000_schedule_cleanup_expired_locks.sql`
  - agenda o job automático via `pg_cron`.
- `supabase/config.toml`
  - define `verify_jwt = false` para `cleanup-expired-locks`.
- `supabase/migrations/20260311010520_fc7a27bc-058e-418c-b4c9-289ec167e201.sql`
  - cria `seat_locks`, incluindo `expires_at`, `sale_id` e RLS.
- `supabase/migrations/20260212213444_e2e671d2-fa63-4684-9d7b-3ba35db44b5a.sql`
  - cria `sale_logs` e colunas de cancelamento (`cancel_reason`, `cancelled_at`).
- `src/pages/public/Checkout.tsx`
  - cria `seat_locks` com expiração de 15 min e a venda em `pendente_pagamento`.

### 2.3 Funções auxiliares / trilhas paralelas relacionadas
Não encontrei função SQL dedicada ao cleanup temporal.

Há trilhas de cancelamento por falha de gateway, mas **não são o cleanup automático central por tempo**:
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

Essas trilhas podem cancelar vendas em casos de falha/expiração de pagamento, mas não substituem a prova de execução do job agendado do cleanup central.

## 3. Agendamento encontrado

### 3.1 Mecanismo identificado
**Mecanismo previsto em código/migration:** `pg_cron` + `pg_net` (`net.http_post`).

### 3.2 Nome do job
`cleanup-expired-locks-every-1-minute`

### 3.3 Frequência
`*/1 * * * *` → a cada 1 minuto.

### 3.4 Comando executado
A migration agenda um `net.http_post(...)` para:

`https://cdrcyjrvurrphnceromd.supabase.co/functions/v1/cleanup-expired-locks`

com header `Content-Type: application/json` e body `{}`.

### 3.5 O que foi comprovado
- **Prova forte:** o repositório contém migration que agenda esse job.
- **Não foi possível comprovar:** que esse job está hoje realmente presente em `cron.job` no ambiente atual.

### 3.6 Conclusão do agendamento
Hoje há **evidência forte de intenção e implementação de agendamento** no código, mas **não há prova forte obtida nesta auditoria de que o job esteja atualmente registrado e ativo no banco real**.

## 4. Evidências de execução no ambiente atual

## 4.1 O que foi possível observar diretamente
Com acesso read-only autenticado no Supabase REST, foi possível observar:

- `sale_logs` com `action = auto_cancelled`;
- `sales` canceladas com `cancel_reason` de expiração automática;
- ausência atual de `seat_locks` visíveis;
- ausência atual de `pendente_pagamento` antigos no escopo acessível.

## 4.2 Evidências indiretas encontradas
### Evidência indireta 1 — logs históricos de cancelamento automático
Foram encontrados registros em `sale_logs` com `action = auto_cancelled`.

Porém, as descrições encontradas foram principalmente:
- `Venda cancelada em migration por expiração de reserva pendente legada (>15 minutos sem confirmação de pagamento).`
- `Venda cancelada automaticamente: tempo de pagamento expirado.`

Essas descrições **não coincidem** com a descrição literal atual da Edge Function auditada, que seria:
- `Venda cancelada automaticamente por expiração de reserva (15 minutos sem confirmação de pagamento).`

**Interpretação:** há histórico de automação/rotinas anteriores ou scripts/migrations operacionais, mas isso **não prova** que a implementação atual do job esteja rodando neste momento.

### Evidência indireta 2 — ausência de pendentes online envelhecidos
No escopo acessível ao usuário auditado, não havia vendas `pendente_pagamento` com mais de 15 minutos.

**Interpretação:** isso é compatível com cleanup funcionando, mas também pode ser explicado por ausência recente de checkout online pendente. Portanto, continua sendo **evidência indireta**, não prova forte.

## 4.3 O que não foi possível comprovar
Não foi possível comprovar diretamente:
- job registrado em `cron.job`;
- job habilitado;
- última execução em `cron.job_run_details`;
- status de sucesso/falha das últimas execuções;
- logs recentes de invocação da Edge Function em painel/log explorer do Supabase.

## 4.4 Conclusão das evidências atuais
**Não há prova forte suficiente, nesta auditoria, de que o job esteja vivo e executando agora.**

Há apenas:
- prova forte de implementação;
- evidência indireta de automação histórica;
- sinais operacionais compatíveis, mas não conclusivos.

## 5. Situação da Edge Function

### 5.1 Compatibilidade com chamada automática
A Edge Function `cleanup-expired-locks` está configurada com `verify_jwt = false`.

**Conclusão:** o desenho atual é compatível com chamada automática por cron via HTTP sem bearer token adicional.

### 5.2 Dependência de autenticação
- **Para o cron:** não depende de JWT de usuário final, pois `verify_jwt = false`.
- **Para acesso ao banco dentro da função:** depende de `SUPABASE_SERVICE_ROLE_KEY` em runtime.

### 5.3 Chance de falha silenciosa
**Sim, existe chance.**

Motivos:
1. Se a função falhar ao buscar locks ou validar locks ativos, ela retorna `500`, mas sem logs observáveis nesta auditoria isso pode passar despercebido operacionalmente.
2. Se falhar ao apagar `seat_locks`, a função apenas faz `console.error`, mas ainda responde com sucesso final; isso cria opacidade parcial.
3. Não há, no código auditado, persistência estruturada de log técnico para cada execução do cleanup, inclusive nos cenários sem trabalho (`cleaned: 0`).

### 5.4 Evidência de invocação recente
**Não foi possível comprovar diretamente.**

Não tive acesso a:
- logs da Edge Function no painel Supabase;
- histórico de invocações recente;
- métricas de execução da função.

### 5.5 Conclusão sobre a função
- **Prova forte:** a função existe e o desenho é compatível com automação.
- **Não foi possível comprovar:** invocação automática recente no ambiente atual.

## 6. Cadeia operacional completa

## 6.1 Fluxo esperado
1. **Job agendado** (`cleanup-expired-locks-every-1-minute`) roda via `pg_cron`.
2. O job faz `net.http_post` para a Edge Function `cleanup-expired-locks`.
3. A função lê `seat_locks` com `expires_at < now`.
4. Identifica os `sale_id` impactados.
5. Verifica se ainda restou lock ativo para a mesma venda.
6. Cancela as vendas elegíveis que ainda estão em `pendente_pagamento`.
7. Grava `sale_logs` com `action = auto_cancelled`.
8. Apaga `sale_passengers` das vendas canceladas.
9. Remove `seat_locks` expirados.
10. Retorna contadores (`cleaned`, `candidate_sales`, `cancellable_sales`).

## 6.2 Pontos com prova forte
- criação do lock com 15 min no checkout;
- uso de `seat_locks.expires_at` como critério do cleanup;
- cancelamento restrito a `pendente_pagamento`;
- remoção de `seat_locks` expirados;
- existência da migration de agendamento;
- compatibilidade da função com cron sem JWT.

## 6.3 Pontos com evidência indireta
- ocorrência histórica de cancelamentos automáticos;
- ausência atual de pendentes online envelhecidos.

## 6.4 Pontos opacos
- se o `cron.schedule(...)` de fato existe hoje no banco do ambiente;
- se está habilitado;
- quando rodou por último;
- se houve erros recentes de execução;
- se a Edge Function está recebendo chamadas automáticas hoje.

## 7. Sinais reais encontrados no banco

### 7.1 Resultado observado nas consultas read-only
No escopo acessível ao usuário autenticado utilizado na auditoria:

- **Total de vendas visíveis:** 94
- **Distribuição por status:**
  - `cancelado`: 46
  - `pago`: 27
  - `reservado`: 18
  - `bloqueado`: 3
  - `pendente_pagamento`: 0

### 7.2 Pendências antigas
- **`pendente_pagamento` com mais de 15 minutos:** 0
- **`reservado` com mais de 15 minutos:** 18

### 7.3 Locks
- **`seat_locks` expirados visíveis:** 0
- **`seat_locks` ativos visíveis:** 0

### 7.4 Logs de cancelamento automático
Foram encontrados registros de `sale_logs.action = auto_cancelled`, porém com descrições legadas/migration e não com a mensagem atual da função auditada.

### 7.5 Interpretação técnica correta
- **Não há prova de backlog atual de checkout online pendente** no escopo consultado.
- **Há prova de reservas antigas abertas** (`reservado`), mas isso não serve para provar falha do cleanup central, pois esse cleanup não trata `reservado`.
- **A ausência de locks visíveis agora** pode significar cleanup funcionando, ausência de tráfego recente ou simplesmente inexistência de locks naquele instante. Sozinha, essa ausência **não é prova forte**.

## 8. Lacunas de observabilidade

1. **Sem acesso a `cron.job`** nesta auditoria, não foi possível comprovar o registro real do job.
2. **Sem acesso a `cron.job_run_details`**, não foi possível comprovar últimas execuções, sucesso/falha e erros.
3. **Sem acesso aos logs nativos das Edge Functions**, não foi possível comprovar invocação automática recente.
4. **`cleanup-expired-locks` não persiste log técnico por execução**; ele só registra `sale_logs` quando há cancelamento de venda.
5. **Execuções sem trabalho (`cleaned: 0`) não deixam trilha operacional persistida** em banco.
6. **Falha no delete final de locks gera apenas `console.error`**, sem log estruturado persistente.
7. **Histórico textual heterogêneo em `sale_logs`** dificulta distinguir qual implementação executou cada cancelamento automático.

## 9. SQLs para validação manual

> Observação: os SQLs abaixo são para validação manual no Supabase SQL Editor. Não executei esses SQLs diretamente nesta auditoria por falta de acesso administrativo ao schema `cron` e aos logs internos do projeto.

### 9.1 Confirmar se o job existe
```sql
select
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
from cron.job
where jobname = 'cleanup-expired-locks-every-1-minute';
```

### 9.2 Verificar últimas execuções do job
```sql
select
  jobid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname = 'cleanup-expired-locks-every-1-minute'
)
order by start_time desc
limit 50;
```

### 9.3 Verificar falhas recentes do job
```sql
select
  jobid,
  status,
  return_message,
  start_time,
  end_time
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname = 'cleanup-expired-locks-every-1-minute'
)
and status <> 'succeeded'
order by start_time desc
limit 50;
```

### 9.4 Conferir payload do comando agendado
```sql
select
  jobid,
  jobname,
  schedule,
  command,
  active
from cron.job
where jobname = 'cleanup-expired-locks-every-1-minute';
```

### 9.5 Verificar vendas `pendente_pagamento` antigas
```sql
select
  id,
  company_id,
  created_at,
  status,
  cancel_reason,
  cancelled_at,
  asaas_payment_status
from public.sales
where status = 'pendente_pagamento'
  and created_at < now() - interval '15 minutes'
order by created_at asc;
```

### 9.6 Verificar `seat_locks` expirados ainda presentes
```sql
select
  id,
  sale_id,
  trip_id,
  seat_id,
  company_id,
  locked_at,
  expires_at
from public.seat_locks
where expires_at < now()
order by expires_at asc;
```

### 9.7 Verificar locks ativos atuais
```sql
select
  id,
  sale_id,
  trip_id,
  seat_id,
  company_id,
  locked_at,
  expires_at
from public.seat_locks
where expires_at > now()
order by expires_at asc;
```

### 9.8 Verificar cancelamentos automáticos no histórico
```sql
select
  id,
  sale_id,
  action,
  description,
  company_id,
  created_at
from public.sale_logs
where action = 'auto_cancelled'
order by created_at desc
limit 100;
```

### 9.9 Cruzar cancelamentos automáticos com a razão de cancelamento da venda
```sql
select
  s.id,
  s.company_id,
  s.created_at,
  s.status,
  s.cancel_reason,
  s.cancelled_at,
  l.created_at as log_created_at,
  l.description as log_description
from public.sales s
left join public.sale_logs l
  on l.sale_id = s.id
 and l.action = 'auto_cancelled'
where s.status = 'cancelado'
  and (
    s.cancel_reason ilike '%expir%'
    or l.description ilike '%expir%'
    or l.description ilike '%auto%'
  )
order by coalesce(s.cancelled_at, l.created_at) desc;
```

### 9.10 Procurar vendas pendentes sem lock ativo
```sql
select
  s.id,
  s.company_id,
  s.created_at,
  s.status,
  max(sl.expires_at) as latest_lock_expires_at,
  count(sl.id) filter (where sl.expires_at > now()) as active_lock_count,
  count(sl.id) filter (where sl.expires_at < now()) as expired_lock_count
from public.sales s
left join public.seat_locks sl
  on sl.sale_id = s.id
where s.status = 'pendente_pagamento'
group by s.id, s.company_id, s.created_at, s.status
having count(sl.id) filter (where sl.expires_at > now()) = 0
order by s.created_at asc;
```

### 9.11 Verificar extensão `pg_cron` e `pg_net`
```sql
select extname, extversion
from pg_extension
where extname in ('pg_cron', 'pg_net');
```

### 9.12 Validar se há invocação recente em logs da função (quando disponível em tabela/log sink)
Se houver uma tabela própria de observabilidade de edge invocations no projeto, adaptar para o nome real. Caso contrário, essa validação precisa ser feita pelo painel de logs do Supabase.

## 10. Checklist manual no Supabase

### 10.1 Confirmar o job
1. Abrir o **Supabase Dashboard** do projeto correto.
2. Ir em **SQL Editor**.
3. Rodar o SQL da seção **9.1**.
4. Verificar se existe linha para `cleanup-expired-locks-every-1-minute`.
5. Interpretar:
   - **1 linha + `active = true`** → evidência forte de job registrado e habilitado.
   - **0 linhas** → job não registrado no ambiente atual.
   - **`active = false`** → job existe, mas está desabilitado.

### 10.2 Confirmar execuções reais
1. Rodar o SQL da seção **9.2**.
2. Verificar `start_time`, `end_time`, `status`, `return_message`.
3. Interpretar:
   - **execuções recentes com `status = succeeded`** → prova forte de execução.
   - **execuções com erro** → mecanismo existe, mas não está confiável.
   - **nenhuma execução** → job pode não estar funcionando mesmo que exista.

### 10.3 Verificar falhas recentes
1. Rodar o SQL da seção **9.3**.
2. Avaliar mensagens em `return_message`.
3. Procurar especialmente por:
   - erro de permissão;
   - erro HTTP;
   - função não encontrada;
   - problema em `net.http_post`;
   - timeout.

### 10.4 Validar o comando agendado
1. Rodar o SQL da seção **9.4**.
2. Confirmar se a URL chamada termina com `/functions/v1/cleanup-expired-locks`.
3. Confirmar se a frequência está em `*/1 * * * *`.
4. Se a URL estiver errada ou apontar para outro projeto, o job existe mas está incorreto.

### 10.5 Validar sintomas operacionais no banco
1. Rodar os SQLs **9.5**, **9.6**, **9.7**, **9.8**, **9.9** e **9.10**.
2. Interpretar:
   - **muitos `pendente_pagamento` antigos** → forte indício de falha do cleanup.
   - **muitos `seat_locks` expirados ainda presentes** → forte indício de falha do cleanup.
   - **logs recentes de `auto_cancelled` coerentes com o job atual** → evidência operacional favorável.
   - **nenhum lock expirado e nenhum pendente antigo**, junto com execuções recentes de cron → cenário saudável.

### 10.6 Validar logs nativos da Edge Function
1. No Supabase Dashboard, abrir **Functions** → `cleanup-expired-locks`.
2. Abrir **Logs**.
3. Filtrar por período recente (últimas 24h / 7 dias).
4. Procurar por:
   - invocações recorrentes em intervalo compatível com 1 min;
   - erros 500;
   - mensagens `Found X expired seat locks`;
   - mensagens `Cancelled X expired pending sales`;
   - erros `Error fetching expired locks`;
   - erros `Error fetching active locks for candidate sales`;
   - erros `Error deleting expired locks`.
5. Interpretar:
   - invocação frequente e regular → prova forte de chamada automática;
   - ausência total de logs recentes → forte dúvida sobre execução automática;
   - erros recorrentes → mecanismo existe, mas não está confiável.

### 10.7 Fechamento manual do Step 1
Considerar o mecanismo **comprovadamente ativo e confiável** apenas se houver, ao mesmo tempo:
1. registro do job em `cron.job`;
2. `active = true`;
3. execuções recentes bem-sucedidas em `cron.job_run_details`;
4. logs recentes da Edge Function coerentes;
5. ausência de backlog relevante em `pendente_pagamento` e `seat_locks` expirados.

Se qualquer um desses itens faltar, o veredito deve cair para **parcial** ou **não comprovado**.

## 11. Veredito final

### Resposta objetiva às 7 perguntas da missão
1. **O job automático de cleanup está registrado no ambiente atual?**  
   **Não foi possível comprovar diretamente.**

2. **O job está habilitado?**  
   **Não foi possível comprovar diretamente.**

3. **O job está executando de fato?**  
   **Não foi possível comprovar com prova forte.**

4. **Existem logs ou evidências recentes dessa execução?**  
   **Existem apenas evidências indiretas/históricas insuficientes para prova forte.**

5. **A Edge Function `cleanup-expired-locks` está sendo chamada automaticamente?**  
   **O desenho é compatível com isso, mas a chamada automática recente não foi comprovada diretamente.**

6. **Existe trilha suficiente para confiar no mecanismo?**  
   **Não. A trilha atual é insuficiente para confiança plena.**

7. **Se não existir acesso suficiente para provar, quais consultas e verificações manuais precisam ser feitas no Supabase?**  
   **Estão detalhadas nas seções 9 e 10 deste arquivo.**

### Veredito técnico do Step 1
**PARCIAL / NÃO COMPROVADO COM PROVA FORTE**

### Interpretação correta do veredito
- A arquitetura do cleanup existe e é coerente.
- O desenho técnico permite automação real.
- Há sinais históricos de cancelamento automático.
- Mas **não foi possível, nesta auditoria, provar de forma forte que o job esteja hoje registrado, habilitado e executando corretamente no ambiente atual**.

### Conclusão executiva final
**Não é seguro afirmar, com base apenas nas evidências obtidas nesta etapa, que o motor automático de expiração está comprovadamente vivo e confiável no ambiente atual.**

Para fechar o Step 1 com confiança operacional real, é obrigatório validar manualmente:
- `cron.job`;
- `cron.job_run_details`;
- logs recentes da Edge Function `cleanup-expired-locks`.
