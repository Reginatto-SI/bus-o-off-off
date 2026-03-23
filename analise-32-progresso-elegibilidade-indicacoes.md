# 1. Objetivo

Implementar o motor mínimo, auditável e idempotente de progresso e elegibilidade das indicações do Smartbus BR.

Nesta etapa foram adicionados:

- uma função SQL central para recalcular o progresso financeiro real de `company_referrals`;
- um trigger leve em `sales` para rodar o recálculo quando uma venda muda de estado/valor relevante;
- um backfill inicial para sincronizar indicações já existentes com o histórico atual de vendas.

A mudança foi intencionalmente pequena: não altera o fluxo de cadastro, não cria pagamento automático, não mexe na estrutura de `sales` e não introduz uma arquitetura paralela.

# 2. Fonte de verdade financeira

A fonte de verdade continua sendo exclusivamente a tabela `sales`.

O cálculo implementado usa exatamente:

```sql
coalesce(platform_fee_total, platform_fee_amount, 0)
```

Com os filtros obrigatórios:

- `sales.status = 'pago'`
- `sales.company_id = referred_company_id`

Justificativa:

- `platform_fee_total` é o consolidado oficial mais atual;
- `platform_fee_amount` permanece como fallback compatível para histórico/legado;
- `coalesce(..., 0)` evita que valores nulos contaminem a soma;
- nenhum outro campo foi usado para não reinterpretar a lógica financeira já persistida.

# 3. Estratégia de atualização

A estratégia escolhida foi:

- **função central reutilizável**: `public.refresh_company_referral_progress(p_referred_company_id uuid default null)`;
- **trigger leve em `sales`**: `public.handle_company_referral_progress_from_sales()`.

## Por que esta opção foi a mais segura e simples

Eu descartei uma arquitetura nova, fila ou fluxo manual obrigatório porque o projeto já trata `sales` como fonte oficial do financeiro.

A escolha por função central + trigger leve foi a mais segura porque:

1. mantém a regra perto da fonte de verdade (`sales`);
2. evita depender de frontend ou rotina manual para deixar o status correto;
3. concentra o cálculo em um único lugar, reduzindo risco de duplicação;
4. permite reprocessamento manual futuro chamando a mesma função, sem criar regra paralela.

## Como roda

O recálculo é disparado quando `sales` sofre:

- `INSERT`
- `DELETE`
- `UPDATE` em `company_id`, `status`, `platform_fee_total` ou `platform_fee_amount`

Ou seja, somente mudanças que podem alterar a apuração da indicação acionam a rotina.

# 4. Regras de status

A função aplica exatamente estas regras automáticas:

- `progress = 0` → `pendente`
- `progress > 0` e abaixo da meta → `em_progresso`
- `progress >= target_platform_fee_amount` → `elegivel`

Regras preservadas:

- `paga` **nunca** é alterado automaticamente;
- `cancelada` **nunca** é alterado automaticamente.

Também foi preservado o comportamento auditável de `eligible_at`:

- preenche quando a indicação cruza a meta pela primeira vez;
- mantém o timestamp já existente em reprocessamentos futuros;
- não cria efeito colateral financeiro nem pagamento automático.

# 5. Arquivos alterados

- `supabase/migrations/20261028100000_add_company_referral_progress_engine.sql`
- `analise-32-progresso-elegibilidade-indicacoes.md`

# 6. Garantia de idempotência

A idempotência foi tratada como requisito principal.

A função **não soma incrementos** nem grava deltas. Ela sempre:

1. lê o estado real atual de `sales`;
2. agrega por empresa indicada;
3. sobrescreve `progress_platform_fee_amount` com o valor recalculado;
4. recalcula o status a partir desse valor.

Isso significa que rodar a função várias vezes produz o mesmo resultado enquanto `sales` não mudar.

Além disso:

- o `UPDATE` só grava linhas que realmente mudaram (`is distinct from`);
- isso reduz escrita desnecessária e evita ruído de auditoria;
- quando `company_id` muda em uma venda, a função recalcula tanto a empresa antiga quanto a nova.

# 7. Performance

O desenho evita N+1.

Em vez de iterar indicação por indicação, a função faz:

- uma agregação única de `sales` por `company_id`;
- um `UPDATE ... FROM` sobre `company_referrals`.

Benefícios:

- uma única passagem agregada pela fonte financeira relevante;
- menos queries repetidas;
- menor risco de degradação conforme o número de indicações cresce.

O trigger também é leve porque só repassa a empresa impactada para a função central.

# 8. Riscos / limitações

1. **Trigger por linha:** em cenários de atualização massiva de `sales`, o trigger rodará uma vez por linha. Como o escopo do recálculo fica restrito ao `company_id` impactado, o risco foi reduzido, mas vale monitorar se houver cargas em lote muito grandes.
2. **Elegibilidade histórica:** se alguma indicação já estava manualmente marcada como `elegivel`, o timestamp `eligible_at` é preservado. Isso é desejado para auditoria, mas pressupõe que o dado histórico já seja confiável.
3. **Sem tela administrativa ainda:** a engine deixa o status pronto, mas ainda não entrega a visualização operacional do programa.
4. **Sem pagamento automático:** propositalmente o motor só calcula progresso/elegibilidade. O pagamento continua manual e auditável.

# 9. Próximos passos

1. Criar tela/admin de indicações para listar:
   - empresa indicada;
   - progresso financeiro;
   - meta;
   - status;
   - data de elegibilidade.
2. Adicionar ação administrativa manual para marcar recompensa como paga, com observação e operador responsável.
3. Se necessário no futuro, expor um botão seguro de reprocessamento manual reutilizando a mesma função `refresh_company_referral_progress(...)`.

# Checklist final

- [x] cálculo usa apenas `sales`
- [x] só considera `status = 'pago'`
- [x] usa `coalesce(platform_fee_total, platform_fee_amount, 0)`
- [x] não quebra cadastro existente
- [x] não altera pagamentos
- [x] status muda corretamente
- [x] código comentado
- [x] markdown criado
