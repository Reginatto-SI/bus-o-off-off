# Contexto oficial da iniciativa PagBank

Este arquivo é um marcador operacional para tarefas executadas no Codex Cloud.

- Repositório: `Reginatto-SI/bus-o-off-off`
- Branch persistente oficial: `feature/pagbank-integration`
- Destino obrigatório de PRs/Drafts intermediários: `feature/pagbank-integration`
- `main` é permitida somente como destino do PR final, após homologação, regressão do Asaas e autorização explícita do usuário.

## Compatibilidade com Codex Cloud

O Codex Cloud pode carregar o conteúdo da branch selecionada em uma branch local temporária chamada `work`, sem `origin` configurado e sem a referência Git local `feature/pagbank-integration`.

Nessa situação, o nome local `work` ou a ausência de `remote` não devem, isoladamente, bloquear uma tarefa PagBank.

A validação deve seguir as regras do `AGENTS.md` e confirmar conjuntamente este marcador, o checkpoint `docs/pagbank/PAGBANK_IMPLEMENTATION.md` e as instruções PagBank vigentes.

## Escopo atual

- PagBank ainda não está em implementação funcional.
- Payment Link, link de pagamento e checkout hospedado PagBank estão fora do escopo atual.
- O escopo inicial é integração via API com PIX e cartão de crédito.
- Asaas deve permanecer preservado durante toda a implantação e estabilização do PagBank.

Este arquivo não substitui o checkpoint nem as Skills; ele apenas identifica o contexto correto da iniciativa quando o ambiente temporário do Codex Cloud não expõe o nome real da branch.
