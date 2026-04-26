# Análise 9 — Correção mínima da listagem de serviços na aba Serviços do evento

## 1) Diagnóstico da causa raiz

### Sintoma
- Após vincular um serviço na aba **Serviços** do wizard de evento, o vínculo era salvo com sucesso e aparecia em `/vendas/servicos`, porém não era exibido na própria aba do evento.
- A UI mostrava o estado vazio com a mensagem “Todos os serviços já estão vinculados”, mesmo com vínculos existentes.

### Evidência no código
No `EventServicesTab`, a ordem de renderização dos estados estava assim:
1. `noCatalog`
2. `noLinkableServices`
3. `eventServices.length === 0`
4. tabela com `eventServices`

Como `noLinkableServices` é verdadeiro quando todo o catálogo já foi vinculado, esse estado era avaliado **antes** da tabela. Resultado: a tela caía no EmptyState e escondia a listagem de vínculos já existentes.

### Causa raiz
- **Conflito de estado na renderização**: a condição “não há novos serviços para vincular” estava sendo usada indevidamente como se fosse “não há vínculos existentes para listar”.
- Não era problema de persistência, nem de insert/update, nem de recarga após salvar.

---

## 2) Por que aparecia em `/vendas/servicos`, mas não na aba do evento

- `/vendas/servicos` consulta `event_services` para operação de venda e continuava recebendo os registros normalmente.
- A aba do evento também carregava os vínculos (query correta), porém a ordem das condições de UI mascarava esses dados e priorizava o EmptyState de “todos já vinculados”.

Ou seja:
- **Banco e vínculo: corretos**.
- **Renderização da aba Serviços: incorreta em cenário de catálogo totalmente vinculado**.

---

## 3) Arquivos alterados

- `src/components/admin/EventServicesTab.tsx`
- `docs/Analises/analise-9-correcao-listagem-servicos-evento.md`

---

## 4) Correção aplicada (mínima e segura)

1. Criado estado derivado `hasLinkedServices` (`eventServices.length > 0`).
2. Ajustada a ordem da renderização:
   - primeiro renderiza tabela quando há vínculos (`hasLinkedServices`);
   - só renderiza EmptyState de indisponibilidade de novos vínculos quando **não há vínculos** e também não há itens para vincular;
   - mantém EmptyState padrão para “nenhum vínculo” quando aplicável.
3. Separada a mensagem de contexto:
   - quando há vínculos listados e `noLinkableServices` é verdadeiro, exibe texto informativo acima da tabela (“todos do catálogo já estão vinculados”), sem esconder a listagem.

### Itens investigados conforme hipóteses obrigatórias
1. `fetchData()` após salvar vínculo: **sim**, já era chamado em insert/update com `await fetchData()`.
2. Estado `eventServices` após insert/update: **sim**, já era atualizado dentro de `fetchData()`.
3. Query de vínculos em `EventServicesTab`: **correta** para carregar vínculos por `event_id` + `company_id`.
4. Relacionamento com `services` vs `/vendas/servicos`: diferenças de filtro existem por finalidade, mas não eram a causa do sintoma.
5. Filtro incorreto escondendo vínculos ativos: **não** no carregamento; o ocultamento ocorria na camada de renderização condicional.
6. Mensagem “Todos os serviços já estão vinculados” usada para dois estados: **sim**, corrigido separando exibição de lista e estado de disponibilidade para novo vínculo.

---

## 5) Checklist de validação

- [x] Vincular serviço na aba Serviços do evento.
- [x] Após sucesso, vínculo continua aparecendo imediatamente na aba (tabela visível).
- [x] Em cenário “catálogo totalmente vinculado”, tabela permanece visível e mostra apenas mensagem informativa complementar.
- [x] EmptyState “Nenhum serviço vinculado” só aparece quando realmente não houver vínculos.
- [x] Botão “Vincular serviço” permanece funcional e desabilita conforme regra atual.
- [x] Serviço continua disponível em `/vendas/servicos` conforme filtros operacionais vigentes.
- [x] Nenhuma mudança fora de escopo (sem QR, checkout público, relatórios, split, repasse, etc.).
