# Fase 2 — Validação pós-migration e preparação para o rename semântico

## 1. Objetivo
Validar o banco real após a migration da fase 1, auditar os dados existentes da entidade financeira usada em `/admin/socios`, confirmar o comportamento funcional da tela e do fluxo de split no novo escopo multiempresa, mapear os resíduos semânticos ainda existentes e preparar o caminho seguro para a futura fase de rename.

## 2. Contexto de negócio oficial
### 2.1 Parceiros da empresa
- parceiros institucionais/comerciais;
- foco em relacionamento, vitrine e marca;
- não são beneficiários financeiros de split por padrão;
- escopo por empresa.

### 2.2 Patrocinadores do evento
- patrocinadores ligados a evento;
- foco em publicidade;
- não são beneficiários financeiros de split por padrão;
- estrutura: cadastro-base + vínculo por evento.

### 2.3 Sócios com split/comissão
- beneficiários financeiros do split/comissão;
- impactam o repasse da venda;
- precisam de modelagem clara, sem ambiguidade e com escopo multiempresa quando aplicável.

## 3. Validação do schema real após a migration
### 3.1 Método usado
A validação foi feita no banco real conectado ao projeto Supabase configurado em `.env`, autenticando com o usuário informado e consultando a API REST do ambiente atual.

### 3.2 Evidências objetivas encontradas
- `GET /rest/v1/partners?select=id,name,company_id&limit=1` respondeu com sucesso no banco real.
- Na fase anterior, essa mesma consulta retornava erro `42703` (`column partners.company_id does not exist`).
- Isso comprova que a coluna `company_id` agora existe no schema real atual.

### 3.3 O que pôde ser provado diretamente
Foi possível provar diretamente que:
- `partners.company_id` existe no banco real;
- a migration estrutural da fase 1 foi refletida no schema real ao menos no ponto mais crítico (coluna nova);
- o banco real deixou de estar no estado inconsistente validado na fase anterior.

### 3.4 O que não pôde ser provado integralmente via API disponível
Com o nível de acesso disponível nesta sessão, **não foi possível provar diretamente via introspecção SQL online**:
- o tipo exato da coluna;
- a constraint `NOT NULL` por inspeção de catálogo;
- a FK para `companies(id)` por leitura de catálogo do banco;
- a existência do índice por `company_id` + `status`;
- a policy/RLS por leitura direta de `pg_policies`.

### 3.5 Conclusão do schema real
**O banco real agora está materialmente mais alinhado ao repositório versionado, porque `partners.company_id` já existe.**

Mas, por limitação de introspecção remota nesta sessão, a validação completa de tipo/FK/índice/policy precisa ser confirmada por execução SQL administrativa se for exigida uma prova catalog-level mais formal.

## 4. Auditoria dos dados existentes
### 4.1 Quantidade de registros
A tabela `partners` está sem registros no banco real auditado nesta fase.

### 4.2 Situação do `company_id`
- Como não há registros, não existem linhas com `company_id` nulo.
- Também não existem linhas com associação errada conhecida.

### 4.3 Sócios ativos por empresa
- Não existe nenhum sócio ativo em nenhuma empresa no ambiente validado, porque a tabela está vazia.
- Portanto, a regra “no máximo 1 sócio ativo” está trivialmente consistente com o estado atual do banco.

### 4.4 Residual operacional identificado
Foi encontrada ao menos uma empresa com `partner_split_percent > 0` no banco real enquanto a tabela `partners` está vazia.

Isso significa:
- o schema foi saneado no ponto estrutural principal;
- porém existe um resíduo operacional/configuracional: há empresa com percentual de split configurado, mas sem beneficiário financeiro cadastrado.

### 4.5 Risco real dos dados atuais
- **Não há risco de associação errada de sócio com empresa neste momento**, porque não existem registros em `partners`.
- **Há risco de configuração incompleta de split**, caso alguém espere repasse ao sócio financeiro sem antes cadastrar um beneficiário ativo.
- Pelas edge functions atuais, esse cenário tende a resultar em split sem destinatário de sócio, e não em vazamento entre empresas.

### 4.6 Query manual recomendada para auditoria administrativa
Se for necessária uma prova SQL formal com acesso administrativo ao banco, executar:

```sql
select
  count(*) as total_partners,
  count(*) filter (where company_id is not null) as with_company_id,
  count(*) filter (where company_id is null) as without_company_id
from public.partners;

select
  company_id,
  count(*) filter (where status = 'ativo') as active_partners,
  count(*) as total_partners
from public.partners
group by company_id
order by company_id;

select c.id, c.name, c.partner_split_percent
from public.companies c
where c.partner_split_percent > 0
order by c.partner_split_percent desc;
```

## 5. Validação da tela `/admin/socios`
### 5.1 Situação do código atual
A tela está corretamente preparada para o escopo por empresa:
- filtra por `activeCompanyId`;
- não carrega dados se não houver empresa ativa;
- exige empresa ativa antes do CRUD;
- grava `company_id` no payload;
- restringe `update` por `id` + `company_id`;
- a regra de sócio ativo é calculada sobre a lista já filtrada da empresa ativa.

### 5.2 Conclusão funcional da tela
- A tela `/admin/socios` está coerente com o escopo multiempresa introduzido na fase 1.
- Não foi identificado vazamento de dados entre empresas no código atual.
- Não encontrei ajuste adicional indispensável nesta tela para esta fase.

## 6. Validação do fluxo financeiro
### 6.1 Queries revisadas
Foram revisados os pontos críticos:
- `create-asaas-payment`
- `verify-payment-status`
- `asaas-webhook`
- `stripe-webhook`

### 6.2 Resultado da revisão
Todas as queries financeiras atuais que leem `partners` estão coerentes com `company_id`:
- `create-asaas-payment` usa `.eq('company_id', sale.company_id)`;
- `verify-payment-status` usa `.eq('company_id', sale.company_id)`;
- `asaas-webhook` usa `.eq('company_id', companyId)`;
- `stripe-webhook` legado também usa `.eq('company_id', sale.company_id)`.

### 6.3 Consulta global residual incompatível
**Não foi encontrada consulta global residual incompatível com o novo schema em `partners`** nos pontos financeiros auditados nesta fase.

### 6.4 Observação operacional importante
Como não existem registros em `partners`, o fluxo financeiro está estruturalmente coerente, mas sem beneficiário financeiro configurado para receber split de sócio.

## 7. Resíduos estruturais e semânticos encontrados
### 7.1 Resíduos semânticos ainda presentes
Ainda existem itens com `partner` significando “sócio financeiro”:
- tabela `partners`
- tela `Partners.tsx`
- `companies.partner_split_percent`
- `sales.partner_fee_amount`
- `partners.split_percent`
- logs/comentários/variáveis com `partner` em contexto financeiro

### 7.2 Resíduo operacional
- empresa com `partner_split_percent > 0` e nenhum sócio cadastrado em `partners`.

### 7.3 Bloqueadores do rename completo
#### Categoria A — Rename simples
- comentários e textos técnicos internos que usam “partner” com sentido financeiro.

#### Categoria B — Rename com impacto moderado
- `src/pages/admin/Partners.tsx`
- tipos do app e tipos Supabase
- variáveis locais e comentários nas edge functions

#### Categoria C — Rename sensível
- tabela `partners`
- `companies.partner_split_percent`
- `sales.partner_fee_amount`
- `partners.split_percent`
- logs, relatórios e qualquer integração financeira que dependa desses nomes

## 8. Ajustes aplicados nesta fase
### 8.1 Ajustes de código
Nenhum ajuste adicional de código foi aplicado nesta fase.

### 8.2 Justificativa
- a validação pós-migration não encontrou nova inconsistência estrutural no repositório que exigisse correção imediata;
- o principal achado desta fase foi de **estado do ambiente/dados**, não de código: a tabela já recebeu `company_id`, mas o ambiente auditado segue sem registros em `partners` e com pelo menos uma empresa mantendo `partner_split_percent > 0`.

## 9. Itens que ainda bloqueiam o rename completo
1. Confirmar catalog-level (SQL administrativo) de FK, índice e policy, caso a governança do projeto exija prova formal além da API.
2. Decidir a política oficial para empresas com `partner_split_percent > 0` e nenhum sócio cadastrado.
3. Congelar o nome semântico futuro da entidade (`socios_split`, `financial_partners` ou equivalente).
4. Mapear a transição de nomes sensíveis em banco, edge functions, relatórios e tipagens.

## 10. Próximo passo recomendado
### Próximo passo exato
1. Executar uma auditoria SQL administrativa curta para registrar FK/índice/policies da tabela `partners` no ambiente real.
2. Revisar a empresa que ainda está com `partner_split_percent > 0` e decidir se:
   - deve cadastrar um sócio financeiro ativo; ou
   - deve zerar o percentual enquanto não houver beneficiário.
3. A partir disso, iniciar a fase de rename semântico controlado da entidade financeira.

## 11. Veredito final
### Respostas objetivas
1. **A migration da fase 1 foi realmente aplicada no banco real?**
- Sim, ao menos no ponto crítico validado diretamente: `partners.company_id` existe agora no schema real.

2. **`partners.company_id` existe agora no schema real?**
- Sim.

3. **Os dados existentes ficaram consistentes?**
- Sim no sentido de integridade da tabela `partners`, porque ela está vazia; não há linhas ambíguas nem nulas. Porém existe uma pendência operacional: empresa com `partner_split_percent > 0` sem sócio cadastrado.

4. **A tela `/admin/socios` já está corretamente limitada por empresa?**
- Sim, pelo código atual.

5. **O fluxo financeiro já está coerente com o novo escopo multiempresa?**
- Sim, nas queries auditadas.

6. **Ainda existe alguma consulta global ou incompatível?**
- Não foi encontrada nas leituras financeiras e na tela auditadas.

7. **Existe mais de um sócio ativo por empresa?**
- Não; não existem sócios cadastrados no ambiente auditado.

8. **O sistema já está estável para planejar o rename semântico?**
- Sim para planejamento, mas com uma pendência operacional/documental antes da execução do rename: revisar a configuração de empresas com percentual de split > 0 e sem beneficiário cadastrado.

9. **O que ainda precisa ser ajustado antes do rename?**
- validação SQL formal de FK/índice/policy, decisão sobre empresa com split configurado sem sócio e definição final do nome semântico de destino.

10. **Qual é o próximo passo exato?**
- auditar catalog-level do banco real com SQL administrativo, revisar a empresa com `partner_split_percent > 0` e então abrir a fase de rename semântico controlado.

### Opção escolhida
**Opção B — A migration foi aplicada, mas ainda existem pendências estruturais ou de dados que precisam ser saneadas antes do rename.**

### Justificativa
- A correção estrutural principal foi refletida no banco real: `company_id` existe em `partners`.
- O código da tela e das edge functions está coerente com o novo escopo multiempresa.
- Porém ainda há pendências operacionais/semânticas suficientes para não classificar o sistema como totalmente pronto para o rename imediato.
