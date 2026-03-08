

## Plano: Scanner contínuo + preferências do motorista

### Resumo

Evoluir o scanner QR do motorista com modo automático (sem "Ler próximo"), feedback sonoro e vibração, e criar tela de preferências persistidas em localStorage.

### 1. Novo arquivo: `src/lib/driverPreferences.ts`

Utilitário para ler/salvar preferências do motorista em localStorage:

```typescript
type DriverPreferences = {
  scanMode: 'manual' | 'auto';   // default: 'manual'
  soundEnabled: boolean;          // default: true
  vibrationEnabled: boolean;      // default: true
};
```

Funções: `getDriverPreferences()`, `setDriverPreferences(prefs)`.

### 2. Novo arquivo: `src/lib/driverScannerFeedback.ts`

Utilitário com funções de feedback:

- `playBeep(success: boolean)` — gera beep usando Web Audio API (AudioContext + oscillator). Sucesso: tom agudo curto. Erro: tom grave duplo.
- `vibrateDevice(success: boolean)` — usa `navigator.vibrate()`. Sucesso: 100ms. Erro: [100, 50, 100]ms.

Sem dependências externas — tudo via APIs nativas do browser.

### 3. Nova rota e página: `/motorista/preferencias`

Arquivo: `src/pages/driver/DriverPreferences.tsx`

Tela mobile-first simples com:
- Header com botão "Voltar"
- **Modo de leitura** — RadioGroup: Manual / Automático
- **Sons do scanner** — Switch toggle
- **Vibração** — Switch toggle
- Cada alteração salva imediatamente em localStorage

### 4. Atualizar `DriverHome.tsx` — header com menu

Substituir o botão "Sair" isolado por um DropdownMenu com ícone de engrenagem (Settings):
- Item: "Preferências" → navega para `/motorista/preferencias`
- Item: "Sair" → `signOut()`

### 5. Atualizar `DriverValidate.tsx` — scanner contínuo + feedback

Mudanças na lógica do scanner:

**Após leitura (overlay aparece):**
1. Chamar `playBeep(overlay.result === 'success')` se som habilitado
2. Chamar `vibrateDevice(overlay.result === 'success')` se vibração habilitada
3. Se modo automático:
   - Esconder botão "Ler próximo"
   - Após 2 segundos, chamar `resetOverlay()` automaticamente (via `setTimeout`)
4. Se modo manual: manter comportamento atual (botão "Ler próximo")

Leitura das preferências via `getDriverPreferences()` no início do componente.

### 6. Atualizar `App.tsx` — nova rota

Adicionar: `<Route path="/motorista/preferencias" element={<DriverPreferences />} />`

### Arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/driverPreferences.ts` | Criar |
| `src/lib/driverScannerFeedback.ts` | Criar |
| `src/pages/driver/DriverPreferences.tsx` | Criar |
| `src/pages/driver/DriverHome.tsx` | Editar header |
| `src/pages/driver/DriverValidate.tsx` | Editar lógica pós-scan |
| `src/App.tsx` | Adicionar rota |

### Sem quebra

Nenhuma funcionalidade existente é alterada. O modo padrão continua "manual". Sons e vibração ficam habilitados por padrão mas o motorista pode desligar a qualquer momento.

