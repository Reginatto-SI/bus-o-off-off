# Análise — implementação do seletor de empresas em modal (Header) — Fase 1

## 1) Onde estava o dropdown atual

- O seletor de empresas ficava no `AdminHeader` com `DropdownMenu`.
- A lista era linear, sem busca e sem filtros, usando `userCompanies.map(...)`.
- A troca continuava via `switchCompany(company.id)`.

## 2) Como foi substituído

- O dropdown foi substituído por um botão no header que abre `Dialog`.
- O modal implementa seleção avançada com:
  - busca por nome/documento (filtro em memória);
  - filtro de status (`Todas`, `Ativas`, `Inativas`) apenas na UI;
  - listagem em tabela compacta com nome, documento, status e ação de seleção.
- A seleção mantém o mesmo contrato: `switchCompany(company.id)` e fechamento do modal após seleção.

## 3) Componentes reutilizados

Reutilização de componentes já existentes no projeto:
- `Dialog` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger`)
- `Input`
- `Select` (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`)
- `Table` (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`)
- `Badge`
- `Button`

## 4) O que NÃO foi alterado (regras críticas)

- `AuthContext` não foi alterado.
- `switchCompany` não foi alterado.
- Nenhuma regra de RLS foi alterada.
- Nenhuma regra de login/auth foi alterada.
- Nenhuma rota nova foi criada.
- Nenhuma tela nova foi criada.
- Nenhuma mudança de backend/banco foi feita.
- Não foi implementada ação de ativar/inativar empresa nesta fase.

## 5) Observação funcional importante da Fase 1

- O filtro de status foi implementado localmente na UI conforme solicitado.
- Como a fonte atual de `userCompanies` vem do fluxo existente, o modal respeita a mesma origem de dados já usada no header nesta fase.

## 6) Próximos passos possíveis (Fase 2)

1. Avaliar fonte de dados para permitir exibição controlada de inativas no modal avançado do Developer.
2. Implementar ação de ativar/inativar no modal com confirmação e auditoria.
3. Definir e implementar fluxo de solicitação de reativação + aprovação manual (sem auto-reativação).
4. Manter compatibilidade com `switchCompany` e sem regressão no isolamento multiempresa.
