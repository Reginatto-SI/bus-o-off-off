# Análise 98 — Padronização de referência visual dos PRDs SEO

## Diagnóstico inicial

A pasta `docs/PRD/SEO` possuía PRDs com regras de conteúdo e SEO por página, mas sem uma fonte central única para o padrão visual das páginas satélite.

Impacto observado:
- risco de deriva visual entre páginas;
- possibilidade de duplicação de instruções da página piloto;
- manutenção mais custosa ao evoluir padrões de hero, cards e blocos de conversão.

## Arquivos encontrados em `docs/PRD/SEO`

1. `docs/PRD/SEO/01 - PRD SEO Estratégico — SmartBus BR (Versão Refinada).txt`
2. `docs/PRD/SEO/02 - PRD — Arquitetura SEO e Ordem de Implementação (SmartBus BR).txt`
3. `docs/PRD/SEO/PRD — Página SEO Caravana Religiosa.txt`
4. `docs/PRD/SEO/PRD — Página SEO Caravana para Jogo de Futebol.txt`
5. `docs/PRD/SEO/PRD — Página SEO Como Gerenciar Caravana.txt`
6. `docs/PRD/SEO/PRD — Página SEO Como Gerenciar Excursões.txt`
7. `docs/PRD/SEO/PRD — Página SEO Como Organizar Caravana.txt`
8. `docs/PRD/SEO/PRD — Página SEO Como Organizar Excursão.txt`
9. `docs/PRD/SEO/PRD — Página SEO Como Vender Passagens Online.txt`
10. `docs/PRD/SEO/PRD — Página SEO Controle de Participantes para Caravana.txt`
11. `docs/PRD/SEO/PRD — Página SEO Controle de Passageiros para Excursões.txt`
12. `docs/PRD/SEO/PRD — Página SEO Controle de Ônibus e Operação de Viagen.txt`
13. `docs/PRD/SEO/PRD — Página SEO Planilha para Caravana.txt`
14. `docs/PRD/SEO/PRD — Página SEO Planilha para Excursões.txt`
15. `docs/PRD/SEO/PRD — Página SEO Sistema Gratuito para Excursões.txt`
16. `docs/PRD/SEO/PRD — Página SEO Sistema para Caravanas.txt`
17. `docs/PRD/SEO/PRD — Página SEO Sistema para Excursões (Evolução Avançada).txt`
18. `docs/PRD/SEO/PRD — Página SEO Sistema para Vender Passagens.txt`

## Arquivos alterados

Foram atualizados os 18 PRDs existentes na pasta com inclusão de uma seção padronizada `## Referência visual obrigatória`, sem remoção de conteúdo pré-existente.

## Novo PRD criado

- `docs/PRD/SEO/PRD — Padrão Visual das Páginas SEO.txt`

Esse documento centraliza as diretrizes visuais e estruturais e estabelece a página `/sistema-para-excursoes` como piloto oficial de referência.

## Critério usado para inserir a seção de referência

- Inserção no início do documento, logo após o título principal, para maximizar visibilidade.
- Texto padronizado único para reduzir inconsistência entre PRDs.
- Referência explícita ao novo PRD base para evitar duplicação das regras visuais em cada arquivo.
- Manutenção das regras de SEO específicas de cada página sem reescrita ampla.

## Checklist final

- [x] Criado PRD base visual em `docs/PRD/SEO/PRD — Padrão Visual das Páginas SEO.txt`.
- [x] Atualizados todos os PRDs existentes em `docs/PRD/SEO` com seção de referência visual obrigatória.
- [x] Evitada duplicação integral do conteúdo da página piloto.
- [x] Nenhuma alteração fora do escopo documental solicitado.
- [x] Conteúdo original dos PRDs preservado.
