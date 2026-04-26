# Análise complementar — ajuste do PRD para seletor de empresas no Header

## 1) Diagnóstico

### Sintoma
O PRD anterior estava tecnicamente correto na regra de inativação/reativação, mas continha termos que podiam induzir implementação com nova tela/novo módulo (ex.: "gerenciador avançado", "tela de triagem", "área administrativa dedicada").

### Onde ocorre
No documento `docs/PRD/Telas/prd-inativacao-reativacao-empresas.md` (versão anterior), em trechos de UX e governança.

### Evidência
- Linguagem sem amarração explícita ao `AdminHeader` em todos os pontos críticos de entrada.
- Termos abertos sobre local de decisão de pendências.
- Risco de interpretação de fluxo fora do seletor atual.

### Causa provável
Ambiguidade semântica: o PRD descrevia a funcionalidade, porém sem tornar normativo que a experiência deve permanecer no seletor existente do header.

---

## 2) Ajuste aplicado no PRD

### Objetivo do ajuste
Eliminar ambiguidade e deixar impossível interpretar criação de nova tela/rota/módulo para a feature.

### Mudanças de redação (normativas)
1. Escopo passou a declarar explicitamente:
   - sem nova tela
   - sem nova rota
   - sem módulo separado
   - sem mover para `/admin/empresa`
2. Entrada única formalizada:
   - botão da empresa atual no `AdminHeader`
   - modal/popup avançado aberto a partir desse botão
3. Terminologia padronizada para:
   - "modal avançado do seletor de empresas"
   - "popup do seletor de empresas no header"
   - "seletor avançado de empresas do Developer"
4. Regra final textual obrigatória incluída no PRD:
   - "A gestão de ativo/inativo e a seleção avançada de empresas do Developer acontecem no modal/popup aberto a partir do seletor de empresas existente no header."

---

## 3) Validação de aderência ao fluxo atual

Com base na implementação existente:
- `AdminHeader` já é o ponto de troca de empresa.
- `AuthContext` já centraliza `userCompanies`, `activeCompany` e `switchCompany`.
- A proposta ajustada mantém esse contrato e só evolui a UX do seletor (dropdown -> modal/popup), sem criar fluxo paralelo.

---

## 4) Riscos remanescentes (registrados)

1. Se o PRD futuro perder termos normativos de escopo, a ambiguidade pode retornar.
2. Implementação deve manter restrições de permissão para ação de ativar/inativar (somente Developer/suporte autorizado).
3. Aprovação de solicitação de reativação deve seguir governança manual (sem auto-reativação de usuário comum).

---

## 5) Conclusão

O PRD foi ajustado para ancorar toda a experiência no `AdminHeader` e no fluxo atual de troca de empresa, removendo interpretação de nova tela/novo módulo.

A diretriz oficial ficou explícita, objetiva e auditável para implementação futura com mudança mínima de arquitetura.
