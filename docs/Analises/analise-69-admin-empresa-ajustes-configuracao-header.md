# Análise 69 — admin/empresa ajustes configuração + header

## Contexto
Solicitação para corrigir duplicidade da configuração **"Permitir embarque manual sem QR Code"** em `/admin/empresa` (aba **Configurações**) e ocultar o botão global **"Indique e Ganhe"** no header.

## Diagnóstico

### Sintoma 1
A opção **Permitir embarque manual sem QR Code** estava aparecendo em dois cards:
1. **Política de Reservas**
2. **Política de Embarque**

### Evidência 1
No arquivo `src/pages/admin/Company.tsx`, havia dois blocos `<Select>` distintos ligados ao mesmo estado `form.allow_manual_boarding`, um em cada card.

### Causa raiz 1
A duplicidade era **de renderização no formulário** (UI), não de armazenamento: os dois campos escreviam na mesma fonte de verdade (`form.allow_manual_boarding`).

---

### Sintoma 2
O botão **Indique e Ganhe** aparecia no header global.

### Evidência 2
No arquivo `src/components/layout/AdminHeader.tsx`, havia um `<Button asChild>` com `<Link to="/admin/indicacoes">` e label `Indique e Ganhe`.

### Causa raiz 2
Renderização fixa do CTA no header (apenas condicionada por breakpoint `xl:inline-flex`), sem bloqueio por regra de visibilidade ativa.

## Correção mínima aplicada

1. **/admin/empresa > Configurações**
   - removido do card **Política de Reservas** o bloco duplicado de `allow_manual_boarding`.
   - mantido o mesmo campo no card **Política de Embarque**.
   - sem criação de novo estado, sem alteração de persistência.

2. **Header global**
   - removido o bloco de renderização do botão **Indique e Ganhe**.
   - mantidos intactos os demais elementos do header (versão, notificações, usuário, empresa ativa, sandbox etc.).

## Observações de segurança
- Alteração localizada e sem impacto em `company_id`.
- Sem mudança de contratos de backend, banco, permissões ou integrações.
- Sem alteração de lógica de salvamento: apenas eliminação de duplicidade visual e remoção de CTA no header.
