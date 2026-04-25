# Análise 95 — Correção da tabela mobile em `/admin/locais`

## Diagnóstico

### Sintoma
No mobile, a listagem de locais em `/admin/locais` exibia **Status** e **Ações** em colunas separadas da coluna principal, exigindo rolagem horizontal para acessar o menu de ações (`...`).

### Onde ocorre
- Arquivo: `src/pages/admin/BoardingLocations.tsx`
- Trecho: renderização da tabela principal de locais (`<TableHead>` e `<TableBody>`)

### Evidência
- Cabeçalho mostrava `Status` e `Ações` sempre como colunas independentes.
- Cada linha renderizava `StatusBadge` e `ActionsDropdown` em células separadas, mantendo largura total incompatível com viewport mobile.

### Causa provável
A estrutura da tabela priorizava colunas tradicionais também no mobile, sem consolidar `status + ações` na primeira célula (`Local`). Isso mantinha o overflow horizontal como requisito de uso.

## Correção mínima aplicada

### Arquivo alterado
- `src/pages/admin/BoardingLocations.tsx`

### Alteração objetiva
1. **Mobile (`< md`)**
   - Ocultadas colunas de cabeçalho `Status` e `Ações` via `hidden md:table-cell`.
   - Inseridos `StatusBadge` e `ActionsDropdown` dentro da célula `Local` com layout horizontal (`justify-between`) e espaçamento adequado.

2. **Desktop (`>= md`)**
   - Mantida estrutura atual com colunas separadas para `Status` e `Ações`.
   - Células de `Status` e `Ações` continuam existindo apenas em `md+`.

### Riscos
- **Baixo risco**: mudança local, restrita à tela `/admin/locais`, sem alteração de componente global de tabela, sem backend e sem mudança de contratos.
