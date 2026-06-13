# Auditoria de termos aceitos por venda

## 1. Onde o aceite fica salvo

Os aceites ficam registrados na tabela `sale_term_acceptances`. Cada registro pertence a uma venda (`sale_id`), evento (`event_id`) e empresa (`company_id`).

A tabela armazena o snapshot aceito no momento da compra, incluindo título, tipo, versão, resumo, texto completo aceito, hash do conteúdo, data/hora do aceite e dados do aceitante.

## 2. Como consultar pelo admin

No painel administrativo, acesse **Vendas**, abra o menu de ações da venda e clique em **Ver Detalhes**. No modal de detalhes, use a aba **Aceites dos Termos**.

A aba é somente leitura. Ela não permite editar, excluir, recriar ou alterar aceites existentes.

## 3. Campos exibidos

A visualização administrativa exibe, quando disponível:

- título do termo (`term_title_snapshot`);
- tipo do termo (`term_type_snapshot`);
- versão aceita (`version_number`);
- data e hora do aceite (`accepted_at`);
- nome do aceitante (`accepted_by_name`);
- CPF mascarado (`accepted_by_cpf`);
- telefone mascarado (`accepted_by_phone`);
- origem do aceite (`acceptance_origin`);
- indicação de aceite explícito (`explicit_acceptance`);
- hash do conteúdo (`content_hash`);
- resumo aceito (`summary_snapshot`);
- texto completo aceito (`accepted_text_snapshot`).

## 4. Snapshot histórico

A auditoria usa exclusivamente os dados gravados em `sale_term_acceptances`. Ela não consulta o termo atual da empresa nem reconstrói o conteúdo por `company_terms.current_version_id`.

Isso garante que o texto exibido represente o conteúdo aceito no momento da compra, mesmo que a empresa publique versões novas posteriormente.

## 5. Como provar que uma venda teve aceite

Para comprovação, abra a venda no admin e confira a aba **Aceites dos Termos**. O registro deve conter:

1. `sale_id` da venda;
2. termo/tipo/versão aceitos;
3. `accepted_at`;
4. nome e dados mascarados do aceitante;
5. `accepted_text_snapshot`;
6. `content_hash`, quando disponível.

O hash ajuda a demonstrar integridade do conteúdo aceito, enquanto o snapshot completo permite conferência textual sem depender da versão atual do termo.

## 6. Consulta SQL simples

```sql
select
  sale_id,
  event_id,
  term_title_snapshot,
  term_type_snapshot,
  version_number,
  accepted_at,
  accepted_by_name,
  accepted_by_cpf,
  accepted_by_phone,
  acceptance_origin,
  content_hash
from sale_term_acceptances
where sale_id = '<ID_DA_VENDA>'
order by accepted_at desc;
```

Em contexto multiempresa, recomenda-se incluir também `company_id`:

```sql
select
  sale_id,
  event_id,
  term_title_snapshot,
  term_type_snapshot,
  version_number,
  accepted_at,
  accepted_by_name,
  accepted_by_cpf,
  accepted_by_phone,
  acceptance_origin,
  content_hash
from sale_term_acceptances
where sale_id = '<ID_DA_VENDA>'
  and company_id = '<ID_DA_EMPRESA>'
order by accepted_at desc;
```

## 7. Limitações conhecidas

- Vendas antigas podem não possuir registros em `sale_term_acceptances`.
- A ausência de aceite não altera status da venda e não cria aceite retroativo.
- A consulta depende das políticas RLS existentes e do vínculo do usuário com a empresa da venda.
- CPF e telefone são mascarados na interface administrativa para reduzir exposição de dados sensíveis.
