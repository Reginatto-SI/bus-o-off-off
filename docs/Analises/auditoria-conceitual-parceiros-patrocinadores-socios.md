# Auditoria Conceitual — Parceiros, Patrocinadores e Sócios

## 1. Objetivo
Auditar, de forma conservadora, como o repositório Smartbus BR modela e usa as entidades ligadas a `/admin/parceiros`, `/admin/patrocinadores` e `/admin/socios`, verificando aderência ao conceito oficial de negócio, clareza semântica, separação entre marketing/publicidade e repasse financeiro, e aderência multiempresa.

## 2. Conceito correto de negócio
### 2.1 Parceiros da empresa
- Vínculo institucional/comercial recorrente com a empresa.
- Finalidade principal: divulgação institucional e relacionamento comercial.
- Não devem ser usados como beneficiários financeiros de split, salvo regra explícita separada.
- Escopo esperado: empresa.

### 2.2 Patrocinadores do evento
- Patrocinadores ligados a um evento específico.
- Finalidade principal: exposição/publicidade do evento.
- Não devem ser tratados como sócios financeiros por padrão.
- Escopo esperado: base por empresa + vínculo por evento.

### 2.3 Sócios com split/comissão
- Beneficiários financeiros do split/comissão da plataforma.
- Finalidade principal: repasse financeiro.
- Precisam de modelagem clara, rastreável e segura.
- Escopo esperado: no mínimo compatível com multiempresa; se houver sócio global da plataforma, isso precisa estar explicitamente assumido e tecnicamente isolado.

## 3. Modelo atual encontrado no sistema
### 3.1 `/admin/parceiros`
- A rota `/admin/parceiros` aponta para `src/pages/admin/CommercialPartners.tsx`.
- A tela usa a tabela `commercial_partners`, sempre filtrada por `company_id`.
- A entidade contém apenas atributos comerciais/visuais: nome, tier, logo, links, contatos, observações e flags de exibição (`show_on_showcase`, `show_on_event_page`, `show_on_ticket`).
- A mesma entidade é consumida na vitrine pública da empresa, no rodapé/arte de passagem e em fluxos públicos de confirmação/consulta de passagem.

### 3.2 `/admin/patrocinadores`
- A rota `/admin/patrocinadores` aponta para `src/pages/admin/Sponsors.tsx`.
- A tela usa a tabela base `sponsors`, filtrada por `company_id`.
- O vínculo com evento não fica em `sponsors`; fica em `event_sponsors`, por relação N:N com `event_id`, `sponsor_id`, `company_id` e flags de exibição.
- A gestão do vínculo por evento acontece no componente `src/components/admin/EventSponsorsTab.tsx` dentro da tela de evento.

### 3.3 `/admin/socios`
- A rota `/admin/socios` aponta para `src/pages/admin/Partners.tsx`.
- A tela usa a tabela `partners`.
- Apesar do nome técnico `partners`, a própria UI se descreve como “Sócios da Plataforma” e explica que a entidade recebe parte da comissão via split Asaas.
- O fluxo financeiro (edge functions) também consulta `partners` como destinatário do split.

### 3.4 Fluxo financeiro real
- A configuração percentual do split fica em `companies.platform_fee_percent` e `companies.partner_split_percent`.
- O destinatário operacional do split é buscado em `partners` com `status = 'ativo'`.
- O valor repassado ao sócio é gravado em `sales.partner_fee_amount`; o líquido da plataforma fica em `sales.platform_net_amount`.
- O código financeiro moderno já tenta tratar esse beneficiário como entidade multiempresa, consultando `partners` por `company_id`, mas a migration original e os tipos gerados do repositório não refletem esse campo.

## 4. Tabelas e relacionamentos identificados

### 4.1 `commercial_partners`
**Propósito real hoje**
- Parceiros institucionais/comerciais da empresa para exposição pública.

**Propósito correto esperado**
- Corresponde bem ao conceito oficial de “Parceiros da empresa”.

**Colunas principais**
- `company_id`, `name`, `status`, `display_order`, `partner_tier`, `logo_url`, `website_url`, `instagram_url`, `whatsapp_phone`, `contact_phone`, `contact_email`, `notes`, `show_on_showcase`, `show_on_event_page`, `show_on_ticket`.

**Relacionamentos**
- FK para `companies` via `company_id`.

**Campos financeiros**
- Nenhum.

**Campos de marketing/publicidade**
- Sim, vários.

**Diagnóstico**
- Entidade semanticamente clara e isolada do fluxo financeiro.

### 4.2 `sponsors`
**Propósito real hoje**
- Cadastro-base de patrocinadores reutilizáveis por empresa.

**Propósito correto esperado**
- Cadastro-base de patrocinadores que podem ser ligados a eventos específicos.

**Colunas principais**
- `company_id`, `name`, `status`, `carousel_order`, `banner_url`, `link_type`, `site_url`, `whatsapp_phone`, `whatsapp_message`, `contact_name`, `contact_phone`, `contact_email`.

**Relacionamentos**
- FK para `companies` via `company_id`.
- Relação indireta com eventos via `event_sponsors`.

**Campos financeiros**
- Nenhum.

**Campos de marketing/publicidade**
- Sim.

**Diagnóstico**
- Estrutura base aceitável, mas há um ruído histórico: a migration de criação descreve a tabela como “patrocinadores globais do app”, enquanto a evolução posterior a tornou multiempresa.

### 4.3 `event_sponsors`
**Propósito real hoje**
- Vínculo entre patrocinadores e eventos, com controle de exibição.

**Propósito correto esperado**
- Exatamente esse.

**Colunas principais**
- `event_id`, `sponsor_id`, `company_id`, `show_on_event_page`, `show_on_showcase`, `show_on_ticket`, `display_order`.

**Relacionamentos**
- FK para `events`, `sponsors` e `companies`.

**Campos financeiros**
- Nenhum.

**Campos de marketing/publicidade**
- Sim.

**Diagnóstico**
- Boa separação entre cadastro-base e vínculo por evento.

### 4.4 `partners`
**Propósito real hoje**
- Beneficiário financeiro do split/comissão da plataforma; na prática, representa “sócio”.

**Propósito correto esperado**
- Uma entidade explicitamente nomeada e estruturada como sócio/beneficiário financeiro.

**Colunas principais encontradas no repositório**
- Migration/origem: `name`, `stripe_account_id`, `stripe_onboarding_complete`, `split_percent`, `status`, `notes`, depois `asaas_wallet_id`, `asaas_wallet_id_production`, `asaas_wallet_id_sandbox`.
- Tipos gerados no front: continuam sem `company_id`.

**Relacionamentos**
- Nos tipos e migrations do repositório, nenhum relacionamento com `companies`.
- No código financeiro atual, a tabela é consultada como se tivesse `company_id`.

**Campos financeiros**
- Sim, fortemente.

**Campos de marketing/publicidade**
- Não.

**Diagnóstico**
- Há forte ambiguidade semântica: o nome técnico `partners` não descreve o papel financeiro real.
- Há também inconsistência estrutural relevante entre migrations/tipos e edge functions quanto ao `company_id`.

### 4.5 `companies`
**Papel nesta auditoria**
- Guarda `platform_fee_percent` e `partner_split_percent`, que definem a lógica percentual do repasse.

**Diagnóstico**
- O nome `partner_split_percent` carrega a mesma ambiguidade da tabela `partners`: na prática, a UI já chama esse valor de “Taxa do Sócio”, mas o campo técnico continua com semântica de “partner”.

### 4.6 `sales`
**Papel nesta auditoria**
- Materializa o reflexo financeiro do split.

**Campos relevantes**
- `gross_amount`, `platform_fee_total`, `partner_fee_amount`, `platform_net_amount`.

**Diagnóstico**
- O campo `partner_fee_amount` registra valor de sócio/beneficiário financeiro, não de parceiro comercial nem patrocinador.

## 5. Análise por tela
### 5.1 `/admin/parceiros`
**Entidade usada**
- `commercial_partners`.

**UI/UX**
- A tela comunica “parceiro comercial”, “empresa parceira”, “relacionamento institucional”.
- Os campos são coerentes com branding, contatos e exibição.

**CRUD / filtros / vínculo**
- CRUD local à empresa via `company_id`.
- Filtros por nome, status e tier.
- Flags de exibição para vitrine, página do evento e passagem.

**Conclusão**
- Está ligada ao conceito correto de parceiro institucional/comercial.
- Não há mistura direta com split financeiro.
- O principal risco aqui é apenas terminológico externo: coexistem `commercial_partners` e `partners`, o que pode gerar manutenção confusa porque “parceiro” significa duas coisas diferentes no repositório.

### 5.2 `/admin/patrocinadores`
**Entidade usada**
- Cadastro-base em `sponsors`.
- Vínculo por evento em `event_sponsors`.

**UI/UX**
- A própria tela informa que o cadastro base deve ser vinculado aos eventos depois.
- O componente de evento comunica corretamente o vínculo “Adicionar patrocinador ao evento”.

**CRUD / filtros / vínculo**
- CRUD multiempresa em `sponsors`.
- Associação N:N em `event_sponsors`.
- Flags de exibição por evento.

**Conclusão**
- Conceito está majoritariamente correto.
- Não há mistura com split financeiro.
- Há um pequeno desvio de comunicação: alguns pontos públicos ainda exibem `sponsors` da empresa na vitrine, enquanto o conceito oficial pedido é “patrocinadores do evento”. Isso não quebra a estrutura, mas amplia o alcance da entidade além do evento em alguns contextos.

### 5.3 `/admin/socios`
**Entidade usada**
- `partners`.

**UI/UX**
- A UI fala “Sócios da Plataforma” e descreve split/comissão corretamente.
- Porém o arquivo, a rota interna importada e a tabela continuam usando o nome técnico “partners”.

**CRUD / filtros / vínculo**
- CRUD simples em `partners`.
- A tela não filtra por `company_id`.
- A regra funcional visível na tela é “no máximo 1 sócio ativo”.
- A rota é restrita a developer, sinalizando que não se trata de cadastro comercial comum.

**Conclusão**
- Conceitualmente a tela quer representar “sócio”, não “parceiro”.
- O nome técnico da entidade está errado para o papel que exerce.
- Há risco estrutural porque o código financeiro já pressupõe `company_id`, mas a tela e os tipos do front não mostram esse vínculo.

## 6. Análise do fluxo financeiro
### 6.1 Tabela usada no split hoje
- O backend usa `partners` como fonte do beneficiário financeiro ativo.

### 6.2 Como o fluxo funciona
1. A empresa define `platform_fee_percent` e `partner_split_percent`.
2. O backend busca um registro ativo em `partners`.
3. Se houver wallet válida, monta o split com plataforma + sócio.
4. Após confirmação, grava em `sales` os campos `platform_fee_total`, `partner_fee_amount` e `platform_net_amount`.

### 6.3 Avaliação conceitual
- O código trata `partners` como “sócio financeiro”, não como parceiro comercial e não como patrocinador.
- Portanto, a resposta objetiva é: **a tabela usada hoje para split representa operacionalmente um sócio, apesar do nome técnico `partners`.**

### 6.4 Risco crítico identificado
- O código financeiro atual consulta `partners` com filtro `.eq('company_id', ...)`, inclusive com comentário explícito de hardening multi-tenant.
- Porém a migration de criação de `partners` não possui `company_id`, e os tipos gerados do repositório também não possuem esse campo.
- Isso indica uma das duas situações, ambas ruins:
  1. o banco real recebeu alteração fora das migrations/versionamento; ou
  2. o código financeiro está apontando para uma estrutura que o esquema versionado não garante.

### 6.5 Conclusão do fluxo financeiro
- O risco não é mistura com marketing/publicidade no fluxo em si; o fluxo financeiro está separado em intenção.
- O problema é **semântico e estrutural**: ele usa uma entidade mal nomeada e com indício forte de inconsistência multiempresa no schema versionado.

## 7. Problemas de nomenclatura
### Categoria A — Apenas nomenclatura
1. **Tabela `partners`**
- Nome técnico sugere “parceiros”, mas o papel real é “sócios/beneficiários financeiros”.

2. **Campo `companies.partner_split_percent`**
- A UI o chama de “Taxa do Sócio”, mas o campo técnico continua com semântica de `partner`.

3. **Campo `sales.partner_fee_amount`**
- Tecnicamente registra comissão do sócio/beneficiário financeiro, não de parceiro comercial.

4. **Arquivo `src/pages/admin/Partners.tsx`**
- O arquivo e o import route usam `Partners`, enquanto a UI expõe “Sócios”.

## 8. Problemas de modelagem
### Categoria C — Erro estrutural de modelagem
1. **`partners` nasceu sem `company_id` e sem relacionamento com empresa**
- Isso conflita com a diretriz multiempresa e com o uso financeiro atual.

2. **Código financeiro pressupõe `partners.company_id`, mas schema versionado/tipos não confirmam isso**
- Isso é inconsistência estrutural do repositório.

3. **`split_percent` em `partners` aparenta estar obsoleto/desalinhado**
- O percentual efetivamente usado no fluxo está em `companies.partner_split_percent`.
- O campo na tabela `partners` tende a induzir interpretação errada ou duplicidade de fonte de verdade.

### Categoria E — Risco multiempresa
1. **`partners` não demonstra vínculo estrutural confiável com empresa no versionamento**.
2. **`/admin/socios` não filtra por empresa**.
3. **Se existir mais de uma empresa/sócio, a regra “apenas 1 sócio ativo” na tela parece global, não por empresa**.

## 9. Problemas de UX e comunicação
### Categoria B — Confusão de UI/UX
1. **A UI pública e administrativa de parceiros comerciais está boa, mas convive com outra entidade técnica chamada `partners`**.
- Para quem mantém o sistema, “parceiro” pode significar entidade comercial ou beneficiário financeiro.

2. **`/admin/socios` comunica corretamente “sócio” na interface, mas grava em `partners`**.
- Isso aumenta a chance de backend, migration, relatório ou manutenção futura assumirem conceito errado.

3. **Patrocinadores aparecem também em superfícies amplas da empresa (showcase/ticket) via `event_sponsors` ou `sponsors`**.
- Não é um erro grave, mas pede documentação de regra para não confundir “patrocinador do evento” com “patrocinador institucional da empresa”.

## 10. Riscos financeiros
### Categoria D — Risco financeiro
1. **A entidade de split está mal nomeada**.
- O código funciona por convenção interna, não por semântica clara.

2. **Há indício de divergência entre schema versionado e código produtivo no `company_id` de `partners`**.
- Isso é risco real de manutenção, migração, ambiente novo e auditoria financeira.

3. **`split_percent` em `partners` pode sugerir configuração financeira por sócio, mas o fluxo usa `companies.partner_split_percent`**.
- Fonte de verdade ambígua é risco operacional.

4. **Tela de sócios não explicita escopo por empresa**.
- Em ambiente multiempresa, isso pode levar operador/desenvolvedor a acreditar em um modelo global quando o backend atual tenta operar por empresa.

## 11. Riscos multiempresa
1. **`commercial_partners`, `sponsors` e `event_sponsors` estão adequadamente vinculados a `company_id`**.
2. **`partners` é o ponto fraco principal**.
3. **O repositório versionado não prova que o beneficiário financeiro está corretamente isolado por empresa**.
4. **Se o schema real divergir das migrations, há risco de novos ambientes nascerem errados.**

## 12. Estrutura recomendada
### Veredito de arquitetura
**Recomendação principal: Cenário 1 — manter tabelas separadas.**

### Estrutura oficial recomendada
1. **Parceiros da empresa**
- Tabela dedicada: manter `commercial_partners` (ou renomear futuramente para algo equivalente em português apenas se houver benefício amplo).
- Escopo: `company_id`.
- Finalidade: marketing/relacionamento.

2. **Patrocinadores do evento**
- Manter `sponsors` como cadastro-base multiempresa.
- Manter `event_sponsors` como vínculo por evento.
- Escopo: `company_id` + `event_id` no vínculo.
- Finalidade: publicidade/evento.

3. **Sócios com split**
- Evoluir `partners` para uma modelagem explicitamente financeira.
- Nome recomendado daqui para frente: `financial_partners`, `split_partners` ou preferencialmente `socios_split` / `financial_beneficiaries` (escolher um padrão e mantê-lo).
- Escopo: obrigatoriamente `company_id`, se o split for por empresa.
- Se existir sócio realmente global da plataforma, isso deve virar regra explícita e não implícita.

### Diretrizes adicionais
- Separar definitivamente nomenclatura de marketing (`commercial_partners`) da nomenclatura financeira (`socios_split`).
- Tornar `companies.partner_split_percent` semanticamente alinhado com “sócio”, ou documentar formalmente o legado até o rename seguro.
- Eliminar/aposentar `partners.split_percent` se ele não for mais usado.

## 13. Correções aplicadas nesta rodada
- **Nenhuma alteração estrutural/funcional foi aplicada no código de produção nesta rodada.**
- Motivo: a auditoria encontrou indícios de inconsistência entre migrations, tipos e fluxo financeiro. Fazer rename ou migração agora, sem mapear dados reais e impacto operacional, aumentaria o risco.
- Entrega desta rodada: documentação formal da auditoria em Markdown para orientar a próxima fase com segurança.

## 14. O que não foi alterado e por quê
1. **Não houve rename de tabela/campos financeiros**
- Porque isso exige migração de banco, atualização de edge functions, tipos, telas e possivelmente dados já existentes.

2. **Não houve mudança no fluxo de split**
- Porque é fluxo crítico financeiro.

3. **Não houve intervenção em RLS/policies de `partners`**
- Porque primeiro é necessário confirmar o schema real do banco em produção/homologação e decidir o modelo oficial (global vs por empresa).

## 15. Próximo passo recomendado
### Fase 1 — validação de esquema real
- Confirmar no banco real se `partners.company_id` existe ou não.
- Se existir, versionar imediatamente a migration faltante e regenerar tipos.
- Se não existir, corrigir o modelo antes de qualquer expansão do split.

### Fase 2 — saneamento semântico mínimo
- Definir oficialmente que `partners` representa sócio financeiro, não parceiro comercial.
- Criar plano de rename conservador (schema, edge functions, types e UI).
- Marcar `split_percent` como legado/obsoleto se não for fonte de verdade.

### Fase 3 — endurecimento multiempresa
- Garantir FK + RLS + filtro por `company_id` na entidade financeira.
- Ajustar `/admin/socios` para refletir o escopo correto (por empresa ou global, conforme decisão oficial documentada).

## 16. Veredito final
### Respostas objetivas
1. **A tabela usada hoje para split representa realmente “sócio” ou representa outra coisa?**
- Representa operacionalmente “sócio/beneficiário financeiro”, embora esteja nomeada como `partners`.

2. **`/admin/parceiros` está ligado ao conceito correto?**
- Sim. Usa `commercial_partners` e está alinhado a parceiro institucional/comercial.

3. **`/admin/patrocinadores` está ligado ao conceito correto?**
- Sim, majoritariamente. O cadastro-base está em `sponsors` e o vínculo correto por evento está em `event_sponsors`.

4. **`/admin/socios` está ligado ao conceito correto?**
- Sim na intenção funcional, mas não no nome técnico da entidade nem na robustez estrutural multiempresa.

5. **Existe alguma mistura conceitual entre marketing/publicidade e repasse financeiro?**
- Não no fluxo operacional principal, mas existe ambiguidade séria de nomenclatura porque “partner” significa duas coisas distintas no repositório.

6. **Existe alguma tabela com nome errado para o papel que exerce?**
- Sim: `partners`.

7. **Existe alguma tela comunicando o conceito errado ao usuário?**
- A UI final está relativamente correta; o problema maior está na camada técnica. Ainda assim, `/admin/socios` oculta a inconsistência estrutural ao usuário porque fala “sócio” sobre uma entidade `partners` sem escopo multiempresa explícito.

8. **Existe risco financeiro por confusão de entidade?**
- Sim.

9. **Existe risco estrutural multiempresa?**
- Sim, concentrado em `partners`.

10. **Qual deve ser a estrutura oficial do projeto daqui para frente?**
- Tabelas separadas: parceiros comerciais (`commercial_partners`), patrocinadores base + vínculo por evento (`sponsors` + `event_sponsors`) e sócios de split em entidade financeira própria, clara e vinculada à empresa.

### Opção escolhida
**Opção C — Existe erro conceitual/estrutural relevante; é necessário reorganizar a modelagem antes de avançar.**

### Justificativa final
- Parceiros comerciais e patrocinadores estão razoavelmente bem separados.
- O problema relevante está na entidade financeira hoje chamada `partners`, que semanticamente representa “sócio”, mas estruturalmente aparece inconsistente no repositório quanto ao vínculo multiempresa e à própria fonte de verdade do split.
- Como essa entidade impacta repasse financeiro, o tema deve ser tratado como saneamento estrutural prioritário antes de novos crescimentos nessa área.
