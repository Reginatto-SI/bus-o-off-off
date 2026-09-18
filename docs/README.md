# Documentação do SmartBus BR

## Fonte de verdade

A documentação versionada neste repositório é a fonte principal para desenvolvimento e manutenção do SmartBus BR.

O Google Drive deve funcionar como **espelho de consulta e backup**, e não como uma segunda fonte normativa independente.

Quando existir divergência:
1. verificar o histórico de commits do GitHub e a data/versão do arquivo do Drive;
2. preservar a versão mais recente e coerente com as Diretrizes Oficiais do Projeto;
3. promover primeiro a versão correta para o GitHub;
4. somente depois atualizar o espelho no Google Drive.

## Ordem de precedência documental

1. `docs/manual-operacional-smartbus-br/Diretrizes Oficiais do Projeto.txt`
2. PRDs expressamente marcados como regra oficial/normativa em `docs/PRD/`
3. PRDs específicos de módulo/tela em `docs/PRD/`
4. manuais operacionais
5. auditorias e análises técnicas

Arquivos em `docs/Analises/` registram investigação, implementação e histórico técnico. Eles não devem sobrescrever uma regra normativa vigente.

## Estrutura canônica

- `docs/PRD/` — PRDs oficiais e documentação de produto
  - `Asaas/` — integração Asaas
  - `Financeiro/` — comissões, repasses, ledger e gateways
  - `Marketing/` — materiais de loja, marca e comunicação
  - `Padroes/` — padrões transversais
  - `SEO/` — estratégia e páginas SEO
  - `Telas/` — comportamento de telas e módulos
  - `Descontinuados/` — documentos mantidos apenas para histórico
- `docs/Analises/` — análises e relatórios técnicos
- `docs/Auditoria/` — evidências e registros de auditoria
- `docs/manual-operacional-smartbus-br/` — manual operacional e diretrizes
- `docs/pagbank/` — estudos e documentação da integração PagBank
- `docs/PRDs/` — nomenclatura legada; não é fonte normativa por si só

## Regra financeira vigente

Para cálculo de taxa, divisão entre Marketplace, Sócio e Representante e comportamento de wallets, a referência normativa é:

`docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`

Documentos históricos ou auxiliares não podem contrariar essa regra.

## Política de sincronização com Google Drive

Sincronizar por padrão:
- `docs/PRD/**`
- `docs/manual-operacional-smartbus-br/**`
- `docs/pagbank/**`

Não sincronizar automaticamente:
- `docs/Analises/**`
- `docs/Auditoria/**`
- arquivos de código, migrations, logs, secrets ou `.env`

Antes de publicar qualquer documento no GitHub público, validar que ele não contém tokens, chaves, senhas ou outros segredos.
