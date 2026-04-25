# 1. Objetivo

Esta análise complementa a análise anterior do programa de indicações do Smartbus BR e fecha a decisão de produto que ficou em aberto naquela etapa:

> no MVP, a indicação oficial nasce por **link gerado dentro do sistema**.

O foco desta rodada não é rediscutir a viabilidade do programa, e sim definir **como o fluxo oficial de indicação por link deve funcionar de forma previsível, auditável, multiempresa e compatível com a arquitetura atual do projeto**.

A análise considera como base já validada:

- a elegibilidade depende de retorno financeiro real da plataforma;
- a apuração financeira deve continuar usando `sales` como entidade central;
- a métrica recomendada continua sendo a soma de `coalesce(platform_fee_total, platform_fee_amount, 0)` apenas para vendas `status = 'pago'` da empresa indicada;
- o sistema não deve criar arquitetura paralela de pagamentos, nem comportamento implícito, nem fluxos ambíguos.

---

# 2. Decisão de produto adotada

A decisão de produto que deve ser tratada como oficial no MVP é:

- a indicação válida nasce por **link de indicação**;
- esse link é gerado **dentro do sistema**;
- o link deve ser rastreável do início ao fim;
- clique sozinho **não** gera indicação oficial;
- simples cadastro **também não** gera recompensa automática;
- o vínculo oficial só existe quando o sistema consegue conectar, de forma auditável, o link usado a uma empresa efetivamente criada no Smartbus BR;
- depois disso, a empresa indicada passa a operar normalmente e a elegibilidade continua dependendo do retorno financeiro real já definido na análise anterior.

Decisão complementar importante para reduzir ambiguidades no MVP:

- o link deve pertencer **à empresa indicadora**, não ao usuário individual.

Justificativa:

- o projeto é multiempresa por natureza;
- quase toda a lógica relevante já gravita em torno de `company_id`;
- atrelar o programa à empresa evita romper o padrão atual com dependência excessiva de um perfil específico;
- o sistema pode continuar registrando qual usuário gerou ou copiou o link, mas a “titularidade” do vínculo deve ser da empresa.

---

# 3. Fluxo funcional recomendado

## 3.1. Visão ponta a ponta

Fluxo recomendado para o MVP:

1. uma empresa autenticada entra no admin;
2. o sistema disponibiliza um link único de indicação da empresa;
3. a empresa compartilha esse link externamente;
4. o visitante acessa a rota pública com o identificador da indicação;
5. o frontend público persiste esse identificador de forma temporária e explícita;
6. o visitante segue para o cadastro público da empresa;
7. ao concluir a criação da nova empresa, o backend valida o tracking recebido;
8. nesse momento, o sistema cria o vínculo oficial entre empresa indicadora e empresa indicada;
9. a indicação nasce como `pendente`;
10. o progresso financeiro passa a ser apurado com base nas vendas pagas da empresa indicada;
11. ao atingir a meta, a indicação vira `elegivel`;
12. quando a plataforma registrar o pagamento da recompensa, a indicação vira `paga`.

## 3.2. Onde o link nasce

O link deve nascer no **admin da empresa indicadora**, em área compatível com o padrão atual do projeto. A recomendação mais segura para MVP é:

- expor o link em uma futura área administrativa de “Indicações”; ou
- caso a tela de indicações ainda não exista, começar com ação mínima dentro de uma área já relacionada à empresa, desde que o vínculo continue pertencendo à empresa e não a um usuário isolado.

O importante nesta etapa não é a tela final, e sim a regra:

- o link só pode ser gerado para empresa autenticada;
- o sistema deve saber qual `company_id` é dono daquele link;
- o link não deve depender de montagem manual pelo usuário.

## 3.3. Formato recomendado do link

A recomendação mais segura para o MVP é seguir um padrão semelhante ao já usado em links curtos de vendedor, mas sem reaproveitar semanticamente a mesma estrutura. Exemplo conceitual:

- rota curta pública dedicada, como `/i/:code`; ou
- rota pública explícita com query param, como `/cadastro?ref=ABC123XYZ`.

Entre as duas opções, a mais limpa para o MVP é:

- usar **rota curta dedicada** para entrada oficial da indicação;
- redirecionar internamente para `/cadastro?ref=...` após resolver o código.

Justificativa:

- mantém o link compartilhável curto, como já acontece no fluxo `/v/:code` de vendedores;
- separa claramente “porta oficial da indicação” das demais rotas públicas;
- evita depender de o usuário copiar query string manualmente;
- preserva possibilidade de evolução futura sem quebrar links antigos.

## 3.4. Como o sistema identifica o indicador

O identificador do link deve resolver **a empresa indicadora**, não apenas um texto arbitrário.

Modelo recomendado:

- cada empresa indicadora possui um `referral_code` único;
- o link aponta para esse código;
- o backend ou RPC pública resolve esse código para `referrer_company_id`;
- o frontend público nunca precisa receber nem expor dados sensíveis da empresa indicadora além do mínimo necessário para UX.

## 3.5. Como a navegação pública captura o tracking

Fluxo recomendado:

### Etapa A — entrada no link
- usuário acessa `/i/:code`;
- a rota resolve o código e valida se ele está ativo;
- se válido, redireciona para `/cadastro?ref=CODE`.

### Etapa B — persistência local temporária
Na tela pública de cadastro, ao detectar `ref`, o frontend deve:

- persistir o código em `sessionStorage` com chave específica do programa de indicação;
- persistir também um timestamp de captura;
- manter esse tracking enquanto o cadastro não for concluído ou expirado.

### Etapa C — envio no momento certo
Ao concluir o cadastro da empresa, o frontend envia o `ref` explicitamente para a edge function de cadastro.

Importante:

- o frontend **não** cria vínculo oficial sozinho;
- ele apenas preserva e encaminha o identificador capturado;
- a criação oficial acontece no backend após validação.

## 3.6. Quando a indicação deixa de ser só tracking e vira vínculo oficial

A indicação deixa de ser somente clique/tracking e vira vínculo oficial **na criação bem-sucedida da empresa indicada**, quando o backend consegue gravar de forma determinística:

- `referrer_company_id`;
- `referred_company_id`;
- `referral_code` usado;
- data/hora da ativação do vínculo.

Esse é o momento mais limpo porque:

- clique isolado ainda é ruído;
- início de preenchimento do cadastro ainda é ruído;
- empresa criada já é entidade real do sistema;
- o vínculo passa a ser multiempresa e auditável desde o nascimento.

## 3.7. Acompanhamento, elegibilidade e pagamento

Depois que o vínculo oficial nasce:

- status inicial: `pendente`;
- ao gerar retorno financeiro > 0: `em_progresso`;
- ao atingir a meta: `elegivel`;
- após baixa administrativa da recompensa: `paga`.

A elegibilidade continua usando a regra financeira já consolidada:

- somar `coalesce(platform_fee_total, platform_fee_amount, 0)`;
- apenas em `sales`;
- apenas da empresa indicada;
- apenas `status = 'pago'`.

---

# 4. Momento recomendado para criação da indicação oficial

## 4.1. Conclusão recomendada

A indicação oficial deve ser criada **na criação bem-sucedida da empresa indicada**, durante o fluxo de cadastro público, quando o backend confirmar o novo `company_id`.

## 4.2. Por que não criar no clique

Criar no clique não é recomendável porque:

- gera ruído alto;
- não cria vínculo real com empresa alguma;
- facilita abuso por múltiplos acessos sem intenção real;
- polui auditoria com “indicações” que nunca viraram empresa.

Clique pode existir como evento de tracking futuro, mas **não** deve nascer como vínculo oficial no MVP.

## 4.3. Por que não criar no início do cadastro

Também não é a melhor opção porque:

- o visitante pode abandonar o fluxo;
- ainda não existe empresa real criada;
- o sistema precisaria lidar com muitos registros fantasmas;
- adiciona uma camada de expiração e limpeza que não é necessária no MVP.

## 4.4. Por que não criar só na primeira venda

Criar somente na primeira venda é tarde demais para o objetivo de rastreabilidade, porque:

- o vínculo entre quem indicou e quem entrou ficaria implícito por tempo demais;
- qualquer disputa posterior ficaria mais difícil de auditar;
- o sistema perderia o registro de quando a empresa entrou pelo link.

## 4.5. Por que a criação da empresa é o melhor ponto

Criar a indicação oficial no momento da criação da empresa é o melhor equilíbrio entre:

- rastreabilidade real;
- baixa ambiguidade;
- simplicidade de implementação;
- aderência ao padrão multiempresa;
- mínima necessidade de limpar ruído operacional.

Nesse desenho, o fluxo fica dividido em duas camadas claras:

### Camada 1 — tracking temporário
- clique no link;
- captura do `ref`;
- persistência local temporária.

### Camada 2 — vínculo oficial
- criação da empresa indicada;
- validação backend do código;
- insert idempotente da indicação oficial.

Essa separação é simples de entender e muito mais auditável.

---

# 5. Estrutura mínima recomendada

## 5.1. Entidade principal recomendada

A análise anterior já apontava necessidade de uma entidade própria de indicação. Para o fluxo oficial por link, a recomendação mínima é uma tabela principal como `company_referrals`.

Campos mínimos recomendados:

- `id`
- `company_id`
  - contexto multiempresa do registro; recomendação: igual a `referrer_company_id`
- `referrer_company_id`
- `referred_company_id`
- `referral_code`
  - código efetivamente usado no fluxo
- `status`
  - `pendente | em_progresso | elegivel | paga | cancelada`
- `tracking_captured_at`
  - data/hora conhecida do tracking recebido pelo fluxo de cadastro, se disponível
- `activated_at`
  - momento em que a indicação virou vínculo oficial
- `target_platform_fee_amount`
- `reward_amount`
- `progress_platform_fee_amount`
- `eligible_at`
- `paid_at`
- `paid_amount`
- `payment_note`
- `created_by`
  - usuário que efetivamente consolidou a criação do vínculo, quando aplicável
- `paid_by`
- `cancelled_by`
- `cancel_reason`
- `created_at`
- `updated_at`

## 5.2. Entidade de código/link

Para não misturar conceito de “campanha/link” com “vínculo entre empresas”, recomendo uma estrutura ainda enxuta para o código oficial do link. Há duas formas possíveis:

### Opção A — código na própria `companies`
Adicionar algo como:

- `companies.referral_code`
- `companies.referral_code_created_at`
- `companies.referral_code_is_active`

### Opção B — tabela filha mínima `company_referral_links`
Campos mínimos:

- `id`
- `company_id`
- `code`
- `is_active`
- `created_by`
- `created_at`
- `updated_at`

## 5.3. Escolha recomendada para o MVP

A escolha mais simples para o MVP é a **Opção A**, com o código de indicação diretamente em `companies`.

Motivos:

- reduz número de tabelas novas;
- favorece relação 1 empresa → 1 link oficial no MVP;
- evita abrir agora um subdomínio de “múltiplos links/campanhas”; 
- é suficiente para a decisão de produto atual.

Ou seja, o desenho mínimo recomendado fica assim:

- `companies` guarda o **código oficial da empresa indicadora**;
- `company_referrals` guarda o **vínculo oficial entre indicadora e indicada**.

## 5.4. Restrições mínimas importantes

- unique para `companies.referral_code`;
- check/validação para impedir código vazio;
- unique em `company_referrals.referred_company_id` para garantir uma única origem oficial por empresa indicada no MVP;
- check para impedir `referrer_company_id = referred_company_id`;
- FKs para `companies`;
- RLS por `company_id`.

## 5.5. Auditoria mínima recomendada

Se o time quiser o mínimo auditável sem exagero, usar:

- campos de timestamp e usuário na tabela principal; e
- uma tabela `company_referral_logs` opcional, inspirada em `sale_logs`, apenas para mudanças críticas.

Ações relevantes para log:

- `tracking_received`
- `referral_activated`
- `status_changed`
- `marked_eligible`
- `marked_paid`
- `cancelled`

---

# 6. Regras de rastreabilidade

## 6.1. Como garantir quem indicou

O sistema deve garantir quem indicou por meio de:

- código único pertencente à empresa indicadora;
- resolução backend desse código para `referrer_company_id`;
- persistência desse código também na indicação oficial (`referral_code`).

Assim, mesmo que a empresa mude nome fantasia ou outros dados, o vínculo continua auditável.

## 6.2. Como garantir quem foi indicado

O sistema deve garantir quem foi indicado no momento em que a empresa nova é criada e recebe `referred_company_id`.

A indicação oficial só é válida quando os dois lados ficam explícitos no mesmo registro:

- `referrer_company_id`
- `referred_company_id`

## 6.3. Como garantir quando o vínculo nasceu

Devem existir dois marcos temporais distintos:

- `tracking_captured_at`: quando o fluxo recebeu o `ref` durante a navegação/cadastro;
- `activated_at`: quando o backend transformou isso em vínculo oficial ao criar a empresa indicada.

Essa separação evita ambiguidade futura entre:

- “quando o link foi usado”;
- “quando a indicação virou oficial”.

## 6.4. Como garantir como o link foi usado

No MVP, não é necessário construir analytics completo de marketing. Basta garantir o essencial:

- qual código foi usado (`referral_code`);
- em que fluxo ele foi recebido (cadastro público da empresa);
- em que data virou vínculo oficial (`activated_at`).

Se necessário, uma tabela de logs pode registrar que o cadastro nasceu com tracking de link válido, mas isso é complementar.

## 6.5. Como evitar ambiguidade futura

Para evitar disputas e ruído, a regra do MVP deve ser objetiva:

- cada empresa indicada pode ter **um único vínculo oficial** de indicação;
- vale o código válido presente no momento da criação da empresa;
- clique posterior em outro link não pode sobrescrever vínculo já ativado;
- uma vez criado o vínculo oficial, o sistema não deve “redecidir” automaticamente o indicador.

## 6.6. Persistência mínima segura do tracking

A persistência recomendada no frontend é:

- capturar `ref` da URL;
- gravar em `sessionStorage`;
- reaplicar no formulário de cadastro se a página recarregar na mesma sessão;
- limpar esse dado quando:
  - o cadastro for concluído com sucesso; ou
  - o código expirar logicamente na sessão; ou
  - o usuário entrar por novo link antes de criar a empresa.

Por que `sessionStorage` e não somente query param?

- reduz perda por navegação intermediária;
- evita depender de manter o `ref` visível em toda URL;
- combina com o caráter temporário do tracking pré-vínculo.

Por que não depender só de `localStorage`?

- aumenta risco de vínculo velho sobreviver além do razoável;
- gera ambiguidade entre sessões antigas e novas;
- é excessivo para o MVP.

---

# 7. Riscos e validações

## 7.1. Autoindicação direta

Risco:
- a própria empresa usar o próprio link para criar outra entrada indevida ou vincular a si mesma.

Validação mínima:
- bloquear quando o código resolver para a mesma empresa que estiver sendo criada/associada;
- impedir `referrer_company_id = referred_company_id` no banco.

## 7.2. Mesma pessoa indicando a si mesma

Risco:
- criar empresas formalmente diferentes, mas com o mesmo responsável operacional.

Validação mínima:
- validar coincidências de documento, email e telefone da empresa/responsável, conforme disponibilidade de dados;
- se houver conflito forte, marcar para revisão manual ou bloquear no MVP.

## 7.3. Reutilização indevida do mesmo link

Risco:
- o mesmo link gerar múltiplas empresas com relação fraudulenta.

Validação mínima:
- permitir tecnicamente que o link seja compartilhado, mas garantir que cada empresa indicada só possa gerar **um** vínculo oficial;
- o prêmio continua sendo por empresa indicada única, não por clique.

## 7.4. Conflito entre múltiplos links

Risco:
- usuário entra por um link, depois por outro, depois conclui o cadastro.

Regra recomendada para o MVP:
- vale o **último código válido presente na sessão no momento do envio do cadastro**, desde que ainda não exista vínculo oficial criado.

Justificativa:
- é simples de implementar;
- é explicável;
- evita inferência subjetiva posterior.

## 7.5. Cadastro iniciado e nunca concluído

Risco:
- gerar tracking sem vínculo real.

Tratamento recomendado:
- não criar registro oficial de indicação nessa etapa;
- manter apenas persistência temporária na sessão;
- opcionalmente registrar evento técnico futuro, mas sem criar entidade de negócio.

## 7.6. Mesma empresa tentando entrar várias vezes

Risco:
- duplicidade operacional ou tentativa de trocar indicador.

Validação mínima:
- garantir unicidade por `referred_company_id` em `company_referrals`;
- se a empresa já existir no Smartbus BR, novo link não cria novo vínculo oficial.

## 7.7. Manipulação manual posterior

Risco:
- alguém alterar o indicador depois da criação para favorecer outro vínculo.

Validação mínima:
- não permitir edição livre de `referrer_company_id` após ativação;
- qualquer cancelamento ou ajuste excepcional deve ficar logado com usuário, data e motivo;
- pagamento continua sendo ação administrativa separada, mas não pode alterar a origem do vínculo.

---

# 8. Impactos no sistema

## 8.1. Rotas públicas

Impacto: **baixo**.

Necessário:

- rota pública curta para entrada do link;
- captura de `ref` no cadastro;
- persistência temporária em sessão.

O projeto já possui padrão similar no fluxo de vendedores (`/v/:code` + redirecionamento com `ref`), o que reduz risco de invenção arquitetural.

## 8.2. Onboarding/cadastro da empresa

Impacto: **baixo a médio**.

Necessário:

- aceitar `ref` no frontend do cadastro;
- enviar esse dado para a edge function de cadastro;
- validar e ativar o vínculo no backend após criação da empresa.

Essa é a principal área de integração do MVP.

## 8.3. Entidade de empresa

Impacto: **baixo**.

Necessário:

- armazenar código oficial de indicação da empresa indicadora;
- opcionalmente registrar metadados mínimos do código.

## 8.4. Admin

Impacto: **baixo a médio**.

Necessário futuramente:

- mostrar o link oficial da empresa;
- permitir copiar o link;
- acompanhar indicações criadas, progresso e status;
- registrar pagamento da recompensa.

## 8.5. RLS / multiempresa

Impacto: **baixo**, desde que o desenho siga `company_id`.

Necessário:

- tabela de indicações com `company_id` alinhado à empresa indicadora;
- políticas para que a empresa veja apenas suas próprias indicações;
- trilha interna/admin com acesso controlado.

## 8.6. Logs / auditoria

Impacto: **baixo**.

Necessário:

- registrar ativação do vínculo;
- registrar mudança de status;
- registrar pagamento;
- registrar cancelamento/ajuste excepcional.

## 8.7. Relatórios futuros

Impacto: **baixo** no MVP.

A recomendação é não misturar indicadores de indicação com KPIs financeiros existentes nesta primeira etapa. Primeiro consolidar o domínio, depois expandir leitura analítica.

---

# 9. Recomendação de MVP

O MVP correto para começar, sem excesso de complexidade, é:

1. cada empresa recebe **um link oficial de indicação** gerado dentro do sistema;
2. o link resolve para um código único da empresa indicadora;
3. a navegação pública captura esse código e o preserva temporariamente em sessão;
4. o vínculo oficial só nasce quando a nova empresa conclui o cadastro com sucesso;
5. o backend cria a indicação oficial de forma idempotente e auditável;
6. o progresso financeiro continua sendo derivado de `sales` da empresa indicada;
7. a recompensa continua sendo one-time e registrada manualmente no admin quando a indicação atingir elegibilidade.

O que **não** deve entrar agora:

- múltiplos links por empresa;
- campanhas diferentes por canal;
- analytics avançado de clique;
- repasse automático da recompensa;
- disputa complexa entre múltiplos indicadores;
- programa recorrente.

Linha mestra recomendada para implementação futura:

> No Smartbus BR, a indicação do MVP nasce oficialmente por link gerado dentro do sistema, com rastreamento auditável e elegibilidade baseada no retorno financeiro real da empresa indicada.

---

# 10. Próximos passos sugeridos

## 10.1. Etapa de modelagem

- definir se o código oficial ficará em `companies` ou em tabela filha;
- definir nome final da tabela de vínculos (`company_referrals`);
- definir enums/status finais;
- definir constraints de unicidade e antifraude mínima.

## 10.2. Etapa de persistência do link/ref

- criar rota pública curta de indicação;
- criar resolução segura do código para empresa indicadora;
- capturar `ref` no cadastro público;
- persistir tracking em `sessionStorage` com timestamp.

## 10.3. Etapa de criação da entidade

- ajustar a edge function `register-company` para aceitar `ref` opcional;
- validar o código no backend;
- criar a indicação oficial junto com a empresa indicada, de forma transacional ou idempotente;
- registrar timestamps e auditoria mínima.

## 10.4. Etapa de cálculo/elegibilidade

- criar a rotina de apuração com base em `sales`;
- atualizar `progress_platform_fee_amount`;
- promover status para `em_progresso` e `elegivel` quando couber;
- manter pagamento separado como baixa manual.

## 10.5. Etapa de tela/admin

- exibir link oficial para a empresa indicadora;
- permitir copiar o link;
- listar indicações com status e progresso;
- permitir ação manual de “marcar como paga”;
- incluir histórico mínimo das transições.

## 10.6. Dúvidas que ainda precisam de validação antes da implementação

- o código do link deve ser permanente ou regenerável pela empresa?
- se houver regeneração futura, links antigos devem morrer imediatamente ou conviver por janela curta?
- qual combinação de dados será usada no MVP para bloquear autoindicação indireta com segurança aceitável?
- o admin interno poderá cancelar vínculos inválidos depois de ativados? Em caso positivo, qual regra operacional deve ser seguida?

---

## Recomendação executiva resumida

O fluxo mais seguro para o Smartbus BR é: **link oficial gerado no sistema → captura rastreável do código → persistência temporária durante o cadastro → criação do vínculo oficial no momento em que a empresa indicada é criada → acompanhamento financeiro por `sales` → elegibilidade por taxa real da plataforma → pagamento manual único e auditável.**
