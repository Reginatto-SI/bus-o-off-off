

# Plano: Corrigir redirecionamento após cadastro de representante

## Causa raiz

Race condition no AuthContext. Quando `signInWithPassword` dispara `onAuthStateChange`, o handler chama `setTimeout(fetchUserData, 0)` mas **não** volta `loading=true`. Como `loading` já foi setado para `false` pelo `getSession()` inicial (sem sessão prévia), o RepresentativeDashboard renderiza com `authLoading=false` + `isRepresentative=false` e executa `Navigate to="/admin/dashboard"` antes de `fetchUserData` terminar.

## Mudança proposta

### Arquivo: `src/contexts/AuthContext.tsx`

No handler de `onAuthStateChange`, ao detectar sessão válida, setar `setLoading(true)` **antes** do `setTimeout(fetchUserData)`. Isso garante que qualquer componente que dependa de `authLoading` (como o RepresentativeDashboard) mostre o spinner enquanto `fetchUserData` resolve os dados do usuário.

```typescript
if (session?.user) {
  setLoading(true); // ← adicionar esta linha
  setTimeout(() => fetchUserData(session.user.id), 0);
}
```

Essa é a correção mínima — 1 linha adicionada. O `fetchUserData` já faz `setLoading(false)` no `finally`, então o ciclo fica consistente.

## Por que funciona

1. `signInWithPassword` → `onAuthStateChange` → `setLoading(true)`
2. RepresentativeDashboard vê `authLoading=true` → mostra spinner
3. `fetchUserData` termina → `isRepresentative=true`, `loading=false`
4. RepresentativeDashboard re-renderiza → passa no guard → exibe painel

## O que NÃO muda

- Lógica de `fetchUserData`
- Fluxo de login normal (Login.tsx já verifica `userRole || isRepresentative` antes de redirecionar)
- Nenhum outro componente ou rota
- Nenhum arquivo adicional
- Nenhum redirect alterado no RepresentativeRegistration

## Risco

Mínimo. A mudança apenas garante que `loading` reflita corretamente que dados estão sendo carregados. Qualquer componente que usa `authLoading` já espera por esse estado.

