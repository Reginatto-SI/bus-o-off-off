# Correção — tela branca com loader em `/validador` e `/validador/validar`

## O que está acontecendo

Analisando `DriverHome.tsx`, `DriverValidate.tsx` e `AuthContext.tsx`, encontrei dois caminhos reais que deixam a tela do motorista travada num spinner sem nada mais aparecer:

### Causa 1 — Guard `!userRole` infinito
Tanto `DriverHome` quanto `DriverValidate` têm:
```
if (loading) → loader
if (!user) → redirect login
if (!userRole) → loader   ← TRAVA AQUI
```
`userRole` fica `null` quando o usuário tem sessão válida mas:
- não tem nenhum registro em `user_roles` para a empresa ativa,
- e não é developer,
- e `rolesData[0]` não existe (ex.: vínculo quebrado, RLS bloqueando leitura, ou usuário recém-criado sem role propagado).

Como `loading` já virou `false` no `finally` do `fetchUserData`, o `!userRole` nunca se resolve sozinho. Resultado: spinner eterno, sem mensagem, sem botão de sair.

### Causa 2 — `loadingTrips` nunca cai a `false` quando falta `activeCompanyId`
Em `DriverHome.fetchAllTrips` (linhas 93–95):
```
if (!user || !activeCompanyId) return;
setLoadingTrips(true);
```
O early-return acontece *antes* de qualquer `setLoadingTrips(false)`. Como `loadingTrips` inicia em `true`, o card principal renderiza Skeletons "para sempre" para usuário sem empresa ativa. O resto do header aparece, mas o usuário enxerga uma tela essencialmente em loading.

### Causa 3 (menor) — falha silenciosa em `fetchAllTrips`
Se qualquer `await supabase...` falhar (rede, RLS), o `setLoadingTrips(false)` no final nunca é alcançado e o `catch` não existe.

## O que vou ajustar (alterações mínimas, só nas telas de validação)

### 1) `src/pages/driver/DriverHome.tsx`
- Substituir o guard `if (!userRole) → <Loader />` por uma checagem com timeout: aguarda até ~3s o role aparecer; depois disso, renderizar um card de erro amigável com:
  - texto: "Não foi possível identificar seu perfil nesta empresa."
  - botões: "Tentar novamente" (recarrega) e "Sair".
- No `fetchAllTrips`:
  - mover `setLoadingTrips(true)` para *antes* do early-return e adicionar `setLoadingTrips(false)` no early-return.
  - envolver as queries em `try/catch/finally` garantindo `setLoadingTrips(false)` sempre.
  - logar erros com contexto (`[DriverHome] fetchAllTrips`, code/message/details/hint).
- Quando `user` existe, `userRole` válido, mas `activeCompanyId` é null, exibir o mesmo card amigável (sem spinner) com instrução para escolher empresa / falar com admin.

### 2) `src/pages/driver/DriverValidate.tsx`
- Aplicar o mesmo padrão para o guard `if (!userRole)`: timeout curto + tela de erro amigável com botão "Voltar" para `/validador` e "Sair".
- Não alterar nenhum fluxo de câmera, scanner, jsQR, RPC de validação ou layout do scanner.

### 3) Não tocar
- `AuthContext.tsx` (já tem fallback e logs).
- Lógica de leitura de QR (`BarcodeDetector`/`jsQR`).
- RPC `validate_ticket_scan`.
- RLS, migrations, edge functions.
- `DriverBoarding.tsx` (não é o escopo reportado).

## Validação

- Tela branca infinita não pode mais existir: ou aparece UI normal, ou um card de erro acionável.
- Motorista com vínculo correto: comportamento idêntico ao atual (sem regressão).
- Logs no console deixam explícito o motivo quando o role não resolve.

## Resposta final ao usuário
Após implementar, vou informar objetivamente: o que estava quebrado, o que foi ajustado, e quais telas mudaram (apenas `DriverHome.tsx` e `DriverValidate.tsx`).
