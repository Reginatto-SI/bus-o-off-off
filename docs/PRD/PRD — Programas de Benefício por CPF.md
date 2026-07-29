# PRD — Programas de Benefício por CPF

## 1. Objetivo

Documentar a funcionalidade existente para cadastrar condições especiais destinadas a passageiros previamente elegíveis por CPF, sem confundi-la com recorrência ou fidelidade automática.

## 2. Regra de ouro

**O benefício somente é aplicado ao passageiro cujo CPF foi previamente cadastrado, está ativo e vigente em um programa ativo, vigente e aplicável ao evento da mesma empresa.**

O sistema não concede benefício por quantidade ou histórico de compras. Não há percentual automático de 5%, pontos, níveis ou identificação de cliente frequente.

## 3. Escopo administrativo

As rotas oficiais são:

- `/admin/programas-beneficio`: listagem;
- `/admin/programas-beneficio/novo`: criação;
- `/admin/programas-beneficio/:id`: edição, eventos e CPFs.

O menu **Programas de Benefício** aparece em **Cadastros** na sidebar desktop e na área secundária **Mais** do mobile/PWA. Não ocupa a barra inferior operacional.

A listagem informa nome, status, tipo, valor, vigência, abrangência, quantidade de CPFs e ações. Programas existentes não são recriados, excluídos, ativados ou alterados pela reabilitação da gestão.

## 4. Permissões e multiempresa

- A interface permite administração apenas a `gerente` e `developer`.
- Toda leitura e mutação administrativa inclui o `activeCompanyId`/`company_id`.
- As tabelas `benefit_programs`, `benefit_program_eligible_cpf` e `benefit_program_event_links` têm RLS.
- Membros da empresa podem ler conforme policy; mutação exige admin e vínculo à empresa.
- FK composta impede associar CPF a programa de outra empresa.
- FK composta e trigger impedem associar programa a evento de outra empresa.
- A RPC pública confirma que `p_event_id` pertence a `p_company_id`.

Trocar a empresa ativa recarrega listagem, programa e eventos no novo escopo. Uma empresa não pode visualizar ou alterar programas/CPFs de outra por meio do CRUD.

## 5. Elegibilidade por allowlist

A origem da elegibilidade é `benefit_program_eligible_cpf`, e não `sales` ou `tickets`. O CPF:

- pertence ao passageiro;
- é normalizado para 11 dígitos;
- precisa estar válido, ativo e dentro da vigência opcional;
- pode constar em mais de um programa da mesma empresa;
- é consultado separadamente para cada passageiro.

O CPF do pagador em `sales.customer_cpf` serve ao comprador/cobrança Asaas e não transfere benefício aos demais passageiros.

## 6. Configuração do programa

Um programa possui:

- nome e descrição;
- status `ativo` ou `inativo`;
- tipo `percentual`, `valor_fixo` ou `preco_final`;
- valor não negativo;
- vigência inicial/final opcional;
- aplicação em todos os eventos ou em eventos específicos da empresa;
- CPFs elegíveis com status/vigência próprios.

Programa inativo, vencido, ainda não vigente ou fora do evento não produz match. Nenhuma reabilitação de rota altera status ou dados existentes.

## 7. Cálculo e desempate

Para o preço original individual:

- percentual: `final = original - (original × percentual / 100)`;
- valor fixo: `final = original - valor`;
- preço final: `final = valor`.

O preço final não fica negativo. Quando mais de um programa é aplicável, vence:

1. menor preço final;
2. maior desconto absoluto;
3. menor ID do programa em ordem lexical.

Os programas não são acumulados. O preço do tipo de passagem tem precedência; preço de categoria/base é fallback.

## 8. Checkout público

O checkout valida o CPF de cada passageiro, chama `get_benefit_eligibility_matches` e apresenta, quando aplicável:

- nome do programa;
- preço original;
- desconto;
- preço final.

Observações administrativas, outros CPFs e outros beneficiários não são retornados nem exibidos. Em falha técnica da elegibilidade, a venda continua com preço original e desconto zero.

## 9. Venda manual

`NewSaleModal` usa o mesmo helper e a mesma elegibilidade por CPF, empresa e evento. O snapshot é individual. O modo de bloqueio não aplica benefício.

## 10. Snapshot e impacto financeiro

A ordem é:

`preço da passagem → benefício → final_price → taxas por passageiro → gross_amount`.

São preservados:

- `sale_passengers.original_price`;
- `sale_passengers.discount_amount`;
- `sale_passengers.final_price`;
- dados e versão da regra do programa;
- `sales.benefit_total_discount`;
- cópia final do snapshot em `tickets`.

Taxas percentuais usam o preço final; taxas fixas permanecem fixas. A taxa progressiva da plataforma usa os preços finais individuais, sem alteração de fórmula, piso, teto ou regra de split.

## 11. Integração Asaas e confirmação

`create-asaas-payment` recompõe soma final, descontos e taxas a partir de `sale_passengers` e bloqueia divergências financeiras. O `paymentPayload.value` recebe `sales.gross_amount`, que já considera o benefício. Não é enviado um desconto paralelo ao Asaas.

Webhook e verificação manual convergem na finalização existente, que copia o snapshot para `tickets`. Este recurso não altera cobrança, split, webhook, confirmação ou status de venda.

## 12. Privacidade

A RPC pública retorna somente `program_id`, `program_name`, `benefit_type` e `benefit_value`. O CPF usado para a busca, nome completo, notas, vigências internas e metadados do cadastro não fazem parte da resposta.

Logs de diagnóstico devem manter CPF mascarado. A allowlist completa é acessível somente no CRUD autenticado e sob RLS da empresa.

### 12.1 Risco residual da RPC pública

Mesmo sem expor nome, observações ou o próprio CPF na resposta, a RPC permite confirmar a existência de um benefício quando o chamador informa uma empresa, um evento dessa empresa e um CPF válido. Isso constitui **risco residual de enumeração**.

Não foi encontrada proteção compartilhada de CAPTCHA, rate limit ou throttling aplicável a esta RPC sem introduzir arquitetura nova; o rate limit existente no repositório é específico da fila de e-mails. Proteção contra automação deve ser avaliada futuramente, sem alterar a regra de elegibilidade.

## 13. Cenários de falha

| Cenário | Comportamento |
|---|---|
| CPF inválido/não cadastrado | Sem benefício; preço original. |
| Programa ou CPF inativo/fora da vigência | Sem match. |
| Evento fora do escopo ou de outra empresa | Sem match/vínculo bloqueado. |
| RPC indisponível | Checkout/venda manual continuam sem desconto e registram erro mascarado. |
| Snapshot divergente do total | Criação da cobrança é bloqueada pela integridade financeira. |
| Usuário sem papel autorizado | Item oculto e página redireciona para área permitida. |

## 14. Critérios de aceite

1. Gerente/developer acessam listagem, criação e edição no desktop e pelo menu **Mais** mobile.
2. Operador, vendedor e motorista não administram programas.
3. Listagem desktop e cards mobile mostram estado real sem alterar registros.
4. CPF aceita entrada formatada ou sem máscara e é persistido normalizado.
5. Eventos apresentados e gravados pertencem à empresa ativa.
6. Os três tipos de benefício e o desempate preservam o cálculo existente.
7. Checkout público e venda manual produzem snapshots idênticos para a mesma entrada.
8. `gross_amount`, taxa, split, valor Asaas e ticket permanecem coerentes.
9. A resposta pública não expõe nome, notas ou lista de CPFs.
10. Nenhum histórico de compras participa da elegibilidade.

## 15. Limitações atuais

- Não há cupom, saldo, limite de utilização, pontos ou níveis neste módulo.
- Não há recorrência automática nem recompensa por vendas pagas anteriores.
- A falha de elegibilidade não bloqueia a venda e pode exigir atendimento caso o passageiro esperasse o benefício.
- A confirmação das policies efetivamente implantadas continua dependendo da verificação de `pg_policies` no ambiente Supabase.

## 16. Ordem obrigatória de publicação

- [ ] 1. Aplicar `20261109100000_minimize_public_benefit_eligibility_rpc.sql`.
- [ ] 2. Validar assinatura e grants da função no Supabase.
- [ ] 3. Executar a RPC como `anon` e confirmar os quatro campos mínimos.
- [ ] 4. Publicar o frontend.
- [ ] 5. Executar uma compra real controlada no checkout com CPF elegível e não elegível.
- [ ] 6. Validar listagem, criação e edição no CRUD como gerente da empresa.

O frontend que consome a resposta mínima não deve ser publicado antes da migration.

## 17. Validação somente leitura pendente no ambiente implantado

Esta revisão não teve credenciais administrativas do projeto Supabase remoto. Portanto, o banco real **não foi declarado como validado**. Executar no SQL Editor, sem mutações:

```sql
-- Assinatura, modo SECURITY DEFINER e search_path.
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_benefit_eligibility_matches';

-- Grants finais da RPC.
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'get_benefit_eligibility_matches'
order by grantee, privilege_type;

-- RLS nas três tabelas.
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in (
  'public.benefit_programs'::regclass,
  'public.benefit_program_eligible_cpf'::regclass,
  'public.benefit_program_event_links'::regclass
)
order by relname;

-- Policies finais.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'benefit_programs',
    'benefit_program_eligible_cpf',
    'benefit_program_event_links'
  )
order by tablename, policyname;

-- anon não pode ler tabelas diretamente e deve executar somente a RPC auditada deste domínio.
select
  has_table_privilege('anon', 'public.benefit_programs', 'select') as anon_select_programs,
  has_table_privilege('anon', 'public.benefit_program_eligible_cpf', 'select') as anon_select_cpfs,
  has_table_privilege('anon', 'public.benefit_program_event_links', 'select') as anon_select_links,
  has_function_privilege(
    'anon',
    'public.get_benefit_eligibility_matches(uuid,uuid,text,date)',
    'execute'
  ) as anon_execute_rpc;
```

Além dessas consultas, executar testes com JWTs reais de duas empresas: gerente da empresa A deve administrar somente A; usuário da empresa B não deve ler nem alterar A. Por fim, chamar `/rest/v1/rpc/get_benefit_eligibility_matches` com a chave anônima e confirmar que cada objeto contém exclusivamente `program_id`, `program_name`, `benefit_type` e `benefit_value`.
