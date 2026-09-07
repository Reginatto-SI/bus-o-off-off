# Contexto atual da iniciativa PagBank

Atualizado em 2026-09-07 por autorização explícita do responsável pelo SmartBus.

- Repositório: `Reginatto-SI/bus-o-off-off`.
- Base atual de desenvolvimento e integração: `main`.
- Branches temporárias, quando utilizadas, partem de `main`; PRs apontam para `main`.
- A obrigatoriedade de `feature/pagbank-integration` foi revogada. Não exigir essa branch nem bloquear trabalho por sua ausência.
- Respeitar permissões e proteções do GitHub, preservar alterações concorrentes e limitar cada mudança ao escopo autorizado.
- O nome local `work` no Codex Cloud e a ausência de remoto não são, isoladamente, bloqueios. Verificar o contexto e o checkpoint disponíveis.
- Documentos antigos que exigem a branch PagBank são históricos quanto a esse fluxo.

## Escopo e segurança

A implementação funcional PIX Sandbox já existe; o estado e as pendências estão em
`PAGBANK_IMPLEMENTATION.md`. Não confundir implementação com homologação concluída.

PagBank em Produção permanece bloqueado. A mudança de branch não autoriza pagamentos reais,
migração automática de empresas, alteração de regras financeiras ou uso de credenciais reais.

Preservar Asaas, isolamento multiempresa, ambiente de origem das vendas e armazenamento seguro.
Payment Link e checkout hospedado continuam fora do escopo.

Leia também o `AGENTS.md`, o checkpoint e as Skills aplicáveis.
