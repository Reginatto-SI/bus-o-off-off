

## Plano: Versão do sistema nas telas do motorista + cache-busting agressivo

### 1. Adicionar `VersionIndicator` na tela do motorista (`DriverHome.tsx`)

Inserir o componente `<VersionIndicator />` no rodapé da tela, abaixo dos botões de ação. Fica discreto e visível sem atrapalhar a operação.

### 2. Adicionar versão compacta na tela de validação QR (`DriverValidate.tsx`)

Inserir uma linha de versão pequena no rodapé (abaixo do debug panel ou do conteúdo principal) — apenas o build number, sem o card completo, para não poluir a tela de scan.

### 3. Cache-busting agressivo no `refresh` do `useVersionCheck`

Alterar a função `refresh` no hook para, antes de recarregar, limpar caches do browser:

```typescript
const refresh = useCallback(async () => {
  // Limpar caches da API Cache Storage (PWA/service worker)
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  // Unregister service workers
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }
  // Hard reload com cache-busting param
  window.location.replace(url.toString());
}, [availableVersion]);
```

Isso garante que ao clicar "Atualizar", o front carrega limpo.

### Arquivos alterados

- `src/hooks/use-version-check.ts` — cache-busting no refresh
- `src/pages/driver/DriverHome.tsx` — adicionar `<VersionIndicator />`
- `src/pages/driver/DriverValidate.tsx` — adicionar linha de versão compacta

