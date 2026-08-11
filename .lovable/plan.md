# App nativo Android com câmera funcional (Capacitor)

Objetivo: gerar um app nativo real (Play Store) em que a câmera da tela `/validador` funcione, eliminando a limitação do WebView do envelopador atual.

## O que será feito no projeto

1. Instalar Capacitor: `@capacitor/core`, `@capacitor/cli` (dev), `@capacitor/ios`, `@capacitor/android`.
2. Criar `capacitor.config.ts` com:
   - appId `app.lovable.a005d492c57449c9b304594fa26531fd`
   - appName `smartbusbr`
   - `server.url` apontando para o sandbox de preview (hot-reload durante testes) + `cleartext: true`
3. Ajuste mínimo na tela do validador para detectar ambiente nativo e usar o fluxo de câmera padrão (sem mudar a lógica atual de fila de câmeras, fallback `facingMode` e token manual — apenas mensagens de erro contextualizadas por ambiente).

Nenhuma outra tela, regra de negócio ou layout será alterado.

## O que você precisa rodar localmente (fora do Lovable)

1. Exportar o projeto para o GitHub e fazer `git pull`.
2. `npm install`
3. `npx cap add android` (e `npx cap add ios` se quiser iPhone)
4. `npm run build` e `npx cap sync`
5. `npx cap run android` (requer Android Studio)

Depois de qualquer alteração envolvendo recursos nativos: `git pull` e `npx cap sync`.

## Permissões nativas

O Android exige, no `AndroidManifest.xml` gerado:

```text
<uses-permission android:name="android.permission.CAMERA" />
```

O WebView do Capacitor já implementa `onPermissionRequest`, que é exatamente o que falta no envelopador atual — por isso a câmera traseira passa a funcionar.

## Observação sobre publicação

Ao publicar na Play Store com Capacitor, recomenda-se remover o `server.url` do config e empacotar o build local (`dist`), mantendo a URL apenas durante o desenvolvimento.

Leitura recomendada: o blog post do Lovable sobre desenvolvimento mobile com Capacitor.
