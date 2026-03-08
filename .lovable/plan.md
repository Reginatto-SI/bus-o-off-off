

## Plano: Indicador de versão no header + atualização inline

### Abordagem

Extrair a lógica de detecção de versão do `VersionUpdateBanner` para um hook reutilizável (`useVersionCheck`), e criar um componente compacto `VersionIndicator` para o header admin.

### Alterações

**1. Criar `src/hooks/use-version-check.ts`**

Hook que encapsula a lógica já existente no `VersionUpdateBanner`:
- Polling de `/version.json` a cada 60s
- Compara com `APP_VERSION`
- Retorna `{ currentVersion, availableVersion, hasUpdate, refresh() }`

**2. Criar `src/components/system/VersionIndicator.tsx`**

Componente compacto para o header:
- Estado normal: texto discreto `v{version}` em `text-xs text-muted-foreground`
- Com atualização: `v{version} • Nova versão` + botão "Atualizar" pequeno (variant link ou ghost, `text-xs`)
- Usa o hook `useVersionCheck`

**3. Atualizar `src/components/system/VersionUpdateBanner.tsx`**

Refatorar para usar o mesmo hook `useVersionCheck`, eliminando duplicação.

**4. Atualizar `src/components/layout/AdminHeader.tsx`**

Adicionar `<VersionIndicator />` na área direita do header, antes do sino de notificações. Discreto, não compete com as ações principais.

### Resultado

- Versão visível no header sem poluir o layout
- Atualização disponível indicada inline, sem popup
- Lógica de versão centralizada em um único hook
- Banner global continua funcionando para páginas públicas/não-admin

