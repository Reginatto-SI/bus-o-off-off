# Análise 11 — Transição de rota `/motorista` para `/validador`

## 1. Diagnóstico

### Sintoma / necessidade
A área operacional do app estava ancorada na rota `/motorista`, mas o conceito atual da tela evoluiu para **Validador** (validação de passagens + serviços).

### Evidências no código
- As rotas principais do portal operacional estavam registradas em `/motorista` no roteador principal (`App.tsx`).
- O redirecionamento pós-login para usuários com role técnica `motorista` apontava para `/motorista` (`Login.tsx`).
- Navegações internas da própria área operacional também apontavam para `/motorista/*` (`DriverHome.tsx`, `DriverValidate.tsx`, `DriverBoarding.tsx`, `DriverPreferences.tsx`).

### Causa provável
A nomenclatura e o path canônico ainda refletiam o nome histórico da área, sem uma rota semântica nova (`/validador`) e sem camada explícita de compatibilidade para links legados.

---

## 2. Onde a rota foi criada

A nova rota canônica foi criada no roteador principal:

- `/validador` → `DriverHome`
- `/validador/validar` → `DriverValidate`
- `/validador/embarque` → `DriverBoarding`
- `/validador/preferencias` → `DriverPreferences`

Implementação feita em `src/App.tsx`, reutilizando exatamente os mesmos componentes já existentes (sem duplicação de lógica).

---

## 3. Como foi feito o redirect

Foi mantida compatibilidade total da rota antiga via redirects automáticos no próprio `App.tsx`:

- `/motorista` → `/validador`
- `/motorista/validar` → `/validador/validar`
- `/motorista/embarque` → `/validador/embarque`
- `/motorista/preferencias` → `/validador/preferencias`

Todos usando `<Navigate ... replace />`, preservando navegação de links antigos e evitando quebra de histórico funcional.

---

## 4. Ajuste no menu

Para manter a experiência coerente com a nova rota canônica, os pontos de navegação do portal operacional foram atualizados para apontar para `/validador/*`:

- Redirecionamento pós-login para role `motorista` agora envia para `/validador` (`Login.tsx`).
- Navegação interna no portal operacional (home, validação, embarque, preferências) agora usa `/validador/*` (`DriverHome.tsx`, `DriverValidate.tsx`, `DriverBoarding.tsx`, `DriverPreferences.tsx`).

Observação: não foi criado novo componente/menu estrutural; apenas troca de destino de navegação para a rota canônica.

---

## 5. Impacto em permissões

Não houve alteração de regra de permissão.

- A role técnica continua sendo `motorista`.
- Os guardas de acesso do portal operacional permanecem os mesmos (`motorista`, `operador`, `gerente`, `developer`) nos componentes existentes.
- A mudança foi apenas de roteamento e navegação, sem nova lógica de autorização.

---

## 6. Checklist final

- [x] `/validador` acessa normalmente o mesmo componente existente.
- [x] `/motorista` redireciona automaticamente para `/validador`.
- [x] Rotas filhas legadas de `/motorista/*` redirecionam para `/validador/*`.
- [x] Navegação interna foi ajustada para usar `/validador/*`.
- [x] Permissões existentes foram preservadas sem nova lógica.
- [x] Não houve refatoração ampla, duplicação de componente, nem alteração de fluxo de validação/QR.
