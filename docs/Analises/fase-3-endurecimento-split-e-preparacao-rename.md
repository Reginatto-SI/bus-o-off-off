# Fase 3 — Endurecimento do split e preparação para rename

## 1. Objetivo
Endurecer o fluxo operacional de split financeiro para impedir estados inconsistentes sem sócio válido, registrar diagnósticos claros, validar formalmente o que foi possível sobre as constraints do banco e definir o nome final recomendado para a futura substituição semântica da entidade hoje chamada `partners`.

## 2. Problema identificado
O cenário crítico identificado foi:
- empresa com `partner_split_percent > 0`;
- ausência de sócio ativo válido em `partners`;
- ou existência de múltiplos sócios ativos;
- ou sócio ativo sem wallet/destino válido.

Esse cenário era perigoso porque o split poderia ficar configurado de forma incompleta e o comportamento financeiro tenderia a ser silencioso ou ambíguo.

## 3. Regra oficial implementada
### Regra adotada
Uma empresa só pode operar com split de sócio quando houver:
1. exatamente **1 sócio ativo** na tabela `partners` para a empresa;
2. destino financeiro válido para o provider usado:
   - Asaas: wallet válida para o ambiente, com fallback controlado para `asaas_wallet_id` legado;
   - Stripe legado: `stripe_account_id` válido.

### Cenários inválidos bloqueados
1. `partner_split_percent > 0` e nenhum sócio ativo;
2. `partner_split_percent > 0` e mais de um sócio ativo;
3. sócio ativo sem wallet/destino configurado.

## 4. Pontos onde a validação foi aplicada
### Backend — obrigatório
- `create-asaas-payment`: agora bloqueia a criação do split quando a configuração do sócio é inválida e retorna erro estruturado.
- `verify-payment-status`: agora valida a configuração do sócio antes de calcular repasse financeiro e retorna erro estruturado se o split estiver inconsistente.
- `asaas-webhook`: agora valida a configuração do sócio antes de consolidar os campos financeiros do split; em caso inválido, registra erro explícito e interrompe a etapa financeira.
- `stripe-webhook` legado: também passou a validar o destino do sócio por empresa e a interromper o repasse legado se estiver inconsistente.

### Frontend — importante
- `/admin/empresa`: agora alerta e bloqueia o salvamento de split acima de zero quando a empresa não possui sócio ativo válido.
- `/admin/socios`: agora alerta explicitamente quando a configuração de split da empresa está incompatível com os sócios cadastrados.

## 5. Mensagens de erro e diagnósticos
### Mensagens estruturadas principais
- `Split configurado, mas nenhum sócio ativo encontrado`
- `Split inválido: mais de um sócio ativo`
- `Split inválido: sócio sem wallet configurada`
- `Split inválido: sócio sem conta Stripe configurada`
- `Falha ao validar o sócio do split`

### Diagnóstico operacional
Os erros agora ficam:
- no log técnico (`logPaymentTrace` / `logSaleOperationalEvent` / logs do webhook legado);
- no retorno estruturado das edge functions críticas;
- no frontend administrativo com alertas claros.

## 6. Auditoria de constraints do banco
### O que foi validado diretamente no banco real
Foi confirmado via API REST do ambiente real que:
- `partners.company_id` existe no schema real atual;
- a tabela `partners` continua sem registros no ambiente auditado;
- existe pelo menos uma empresa com `partner_split_percent > 0`.

### O que não pôde ser provado catalog-level nesta sessão
Com o acesso disponível, não foi possível ler diretamente catálogos do Postgres para provar via introspecção online:
- FK `partners.company_id -> companies.id`;
- índice por `company_id` / `status`;
- policies/RLS.

### SQL recomendado para validação administrativa formal
```sql
select conname, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'partners';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'partners';

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'partners';
```

## 7. Ajustes realizados no código
### Backend
- Foi criada validação compartilhada do sócio financeiro para split em `payment-context-resolver.ts`.
- O helper passou a resolver wallet Asaas com fallback controlado para o campo legado `asaas_wallet_id`, evitando falso negativo para cadastros ainda não migrados semanticamente.
- Os fluxos `create-asaas-payment`, `verify-payment-status`, `asaas-webhook` e `stripe-webhook` agora validam explicitamente a configuração do sócio antes de seguir com o repasse financeiro.

### Frontend
- Foi criado um utilitário pequeno para diagnóstico administrativo da configuração do sócio financeiro.
- `/admin/empresa` passou a alertar e bloquear o salvamento de split acima de zero quando o sócio não estiver válido.
- `/admin/socios` passou a alertar que o backend também bloqueia a criação do split enquanto a configuração da empresa estiver inconsistente.

## 8. Impacto do rename futuro
### Nome atual legado e impactos
- `partners` — **alto impacto**
- `Partners.tsx` — **médio impacto**
- `companies.partner_split_percent` — **alto impacto**
- `sales.partner_fee_amount` — **alto impacto**
- `partners.split_percent` — **alto impacto**
- variáveis locais, comentários e logs com `partner` financeiro — **baixo/médio impacto**, dependendo do ponto

## 9. Nome recomendado da entidade
### Nome escolhido
**`socios_split`**

### Justificativa
- é o nome mais aderente ao negócio oficial em português do projeto;
- reduz ambiguidade com `commercial_partners`;
- deixa explícito que a entidade não é marketing/publicidade, e sim repasse financeiro;
- comunica melhor o papel da tabela, da tela e dos campos relacionados.

## 10. Próximo passo recomendado
1. Executar a fase de rename semântico controlado, adotando `socios_split` como destino final.
2. Planejar também o rename coordenado de:
   - `companies.partner_split_percent`
   - `sales.partner_fee_amount`
   - `partners.split_percent`
3. Antes do deploy final do rename, validar formalmente as constraints com SQL administrativo e revisar a empresa ainda configurada com split > 0 sem sócio cadastrado no ambiente auditado.

## 11. Veredito final
### Respostas obrigatórias
1. **O sistema agora bloqueia split sem sócio?**
- Sim, nos pontos críticos auditados e endurecidos nesta fase.

2. **Existe risco de split inconsistente ainda?**
- O risco foi reduzido de forma importante, mas ainda existe risco operacional residual enquanto houver empresa com `partner_split_percent > 0` sem sócio cadastrado no ambiente real.

3. **O backend está 100% protegido?**
- O backend crítico do split foi protegido com validação defensiva explícita. Ainda assim, a governança do banco deve ser formalmente validada com SQL administrativo para fechamento completo da trilha.

4. **O frontend comunica corretamente o problema?**
- Sim, nas telas `/admin/empresa` e `/admin/socios`.

5. **As constraints do banco estão corretas?**
- Há forte evidência de alinhamento estrutural, mas a validação formal de FK/índice/RLS por catálogo ficou documentada como pendência administrativa.

6. **Qual nome foi escolhido para substituir `partners`?**
- `socios_split`.

7. **O sistema está pronto para a fase de rename?**
- Sim para preparação e planejamento, mas com uma pendência operacional/documental antes da execução completa do rename.

### Opção escolhida
**Opção B — Sistema protegido, mas ainda exige ajustes antes do rename.**

### Justificativa
- O split inconsistente deixou de ser silencioso nos pontos críticos.
- O backend e o frontend administrativo agora comunicam e bloqueiam o problema.
- Ainda falta a validação formal catalog-level de constraints e a revisão da configuração real da empresa que mantém split > 0 sem sócio cadastrado.
