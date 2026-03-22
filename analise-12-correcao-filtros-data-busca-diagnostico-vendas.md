# Correção mínima — filtros de data e busca em `/admin/diagnostico-vendas`

## Objetivo

Registrar a correção mínima aplicada na tela `/admin/diagnostico-vendas` para restaurar a previsibilidade operacional dos filtros, eliminando o truncamento indevido por timezone no filtro de data e removendo a quebra técnica da busca textual.

---

## Causas confirmadas

1. o filtro de data operava sobre `sales.created_at`, mas construía o intervalo com `new Date('YYYY-MM-DD')` + `setHours(...)` + `toISOString()`;
2. essa combinação misturava parsing UTC com ajuste local e truncava o fim do dia em navegadores UTC-03;
3. a venda real `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38` ficava fora do resultado quando o usuário filtrava `22/03/2026`, embora pertencesse ao dia operacional esperado;
4. a busca textual tentava usar `ILIKE` diretamente sobre `sales.id` (UUID), o que quebrava a consulta no backend;
5. a UX prometia busca por evento, mas a implementação não buscava `event.name` nem `ticket_number`.

---

## Arquivos alterados

- `src/pages/admin/SalesDiagnostic.tsx`
- `analise-12-correcao-filtros-data-busca-diagnostico-vendas.md`

---

## Solução aplicada

## 1. Filtro de data
Foi adicionada uma função utilitária local para montar os limites de `sales.created_at` a partir dos componentes numéricos da data (`ano`, `mês`, `dia`) em horário local do navegador, só convertendo para ISO no final.

Com isso:
- `dateFrom` passa a representar o início do dia local do usuário;
- `dateTo` passa a representar o fim do dia local do usuário;
- o filtro continua sobre `sales.created_at`;
- a semântica do dado não foi alterada nesta etapa.

Também foram adicionados comentários no código explicando por que a antiga estratégia era insegura em UTC-03.

## 2. Clareza da UI para a data
Os rótulos dos filtros foram ajustados para:
- `Data inicial da criação da venda`
- `Data final da criação da venda`

Isso explicita a semântica real do filtro sem mudar a estrutura visual da tela.

## 3. Busca textual
A busca textual deixou de depender do `ILIKE` inseguro em UUID.

A solução mínima escolhida foi:
- manter busca por `customer_name`
- manter busca por `customer_cpf`
- aceitar `ID exato da venda` quando o valor é um UUID válido
- adicionar suporte mínimo por `ticket_number`
- adicionar suporte mínimo por `event.name`

A resolução passou a ser feita por etapas explícitas e seguras:
1. procurar IDs de venda por nome;
2. procurar IDs de venda por CPF normalizado;
3. aceitar UUID exato sem usar `ILIKE` no campo `id`;
4. procurar `sale_id` em `tickets` por `ticket_number`;
5. procurar eventos por nome e converter isso em `sales.event_id`;
6. aplicar o resultado final como `id IN (...)` na query principal de `sales`.

Também foram adicionados comentários no código explicando por que essa abordagem foi escolhida como correção mínima e segura.

## 4. Placeholder da busca
O placeholder foi ajustado para refletir melhor o comportamento real entregue agora:
- `Nome, CPF, ticket, ID exato da venda ou evento...`

---

## Por que essa foi a correção mínima escolhida

1. corrige a causa raiz confirmada sem trocar a fonte principal da grade;
2. mantém a tela baseada em `sales`, como já estava;
3. preserva o filtro por `company_id` já aplicado na query principal;
4. não introduz paginação, RPC nova, nem refatoração estrutural;
5. melhora a busca dentro do escopo mínimo, sem reescrever o campo inteiro.

---

## Riscos avaliados

1. a busca textual agora faz consultas auxiliares extras quando o campo é preenchido;
2. o suporte por evento e ticket continua dependente das relações atuais entre `sales`, `tickets` e `events`;
3. a tela continua semanticamente focada em `created_at`, então ainda não resolve expectativas futuras sobre “data do pagamento” ou “data da passagem”.

Esses riscos foram aceitos por serem menores do que o falso negativo operacional anterior.

---

## O que ficou propositalmente fora deste step

- refatoração completa da tela;
- mudança da fonte principal da grade;
- paginação nova;
- filtro por data de pagamento;
- filtro por data de ticket;
- fusão de dados com `sale_logs` e `sale_integration_logs` na query principal;
- filtro explícito por ambiente.

---

## Como validar manualmente

1. acessar `/admin/diagnostico-vendas` com o usuário operacional informado;
2. garantir que a empresa ativa continue sendo respeitada;
3. filtrar `Data inicial da criação da venda = 22/03/2026` e `Data final da criação da venda = 22/03/2026`;
4. confirmar que a venda `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38` aparece na grade;
5. confirmar que os KPIs do topo continuam refletindo o mesmo conjunto da grade;
6. buscar por `Lucas Pedroso` e verificar que a tela responde sem erro;
7. buscar por `SB-000086` e verificar que a venda correta aparece;
8. buscar por `NOVA MUTUM` e verificar que as vendas do evento aparecem;
9. buscar pelo UUID exato `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38` e verificar retorno sem quebra técnica;
10. repetir o fluxo em sandbox e produção, validando que o comportamento do filtro é igual e muda apenas o conjunto de dados.

---

## Validação objetiva desta implementação

Durante esta etapa, foi validado que:
- a faixa corrigida para `22/03/2026` em `America/Sao_Paulo` vira `2026-03-22T03:00:00.000Z` até `2026-03-23T02:59:59.999Z`;
- a venda `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38` entra corretamente nessa janela;
- buscas seguras por nome e ticket retornam o caso real sem erro de operador em UUID;
- o filtro por empresa ativa permanece na query principal.

---

## Resultado esperado após este step

A tela volta a ser confiável no cenário operacional básico porque:
- não corta mais vendas válidas do próprio dia por erro de timezone;
- não quebra mais a busca textual ao tentar comparar UUID com `ILIKE`;
- fica mais clara ao operador sobre qual data está sendo filtrada;
- passa a aceitar os identificadores mais úteis do diagnóstico imediato, inclusive o ticket `SB-000086`.
