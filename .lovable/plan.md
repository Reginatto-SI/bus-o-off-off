

## Plano: Redesign do indicador de versão no header

Inspirado na imagem de referência, o indicador terá um layout contido e profissional com ícone, build info e status.

### Alteração: `src/components/system/VersionIndicator.tsx`

Redesign completo do componente usando o padrão visual da referência:

**Estado normal (sistema atualizado):**
```
[⏱] Build 20260308 · 08/03/2026, 13:11
    Sistema atualizado  ✓
```
- Ícone `Clock` à esquerda
- Linha 1: número do build + data/hora formatada a partir de `APP_BUILD_TIME`
- Linha 2: "Sistema atualizado" em verde com check icon
- Container com `border rounded-lg px-3 py-1.5` para dar forma visual contida

**Estado com atualização disponível:**
```
[⏱] Build 20260308 · 08/03/2026, 13:11
    Nova versão disponível  [Atualizar]
```
- Linha 2 muda para "Nova versão disponível" em amarelo/primary
- Botão "Atualizar" clicável ao lado
- Ícone `RefreshCw` no botão

### Imports adicionais
- `Clock`, `CheckCircle2` do lucide-react
- `APP_BUILD_TIME` do `build-info.ts`
- `format` do `date-fns` para formatar a data

### Nenhuma outra alteração
O header já importa e posiciona o `VersionIndicator` — só o componente muda.

