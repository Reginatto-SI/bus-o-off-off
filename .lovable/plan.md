

## Plano: Overlay no scanner + correção da lista de embarque

### 1. Overlay centralizado sobre a câmera (DriverValidate.tsx)

Atualmente o resultado do scan aparece como um `<Card>` abaixo do viewport da câmera (linha 663-716), exigindo scroll.

**Mudança:** Mover o resultado para um overlay absoluto sobre o viewport da câmera, com fundo semi-transparente. A câmera permanece ativa (stream não é destruído), apenas o scan loop já pausa naturalmente porque `overlay` é truthy (linha 501).

Estrutura do overlay:
- Posicionado `absolute inset-0` dentro do container da câmera (div linha 577)
- Fundo: `bg-black/70` para escurecer
- Conteúdo centralizado:
  - Sucesso: ícone verde + "EMBARQUE LIBERADO" + nome, assento, evento
  - Erro: ícone vermelho + "PASSAGEM INVÁLIDA" + motivo
- Botão principal grande: "Ler próximo" (sucesso) ou "Tentar novamente" (erro)
- Botão secundário: "Ver embarque" (apenas em sucesso)
- Remover o Card de resultado separado abaixo da câmera (linhas 663-716)

O campo manual e o token permanecem abaixo do viewport.

### 2. Corrigir lista de embarque (DriverBoarding.tsx)

**Diagnóstico:** A query da DriverBoarding (linha 75-84) filtra por `driver_id` do user_roles quando disponível. Se o `driver_id` está vinculado mas a trip em questão não tem esse driver atribuído, retorna 0 trips. A validação por QR funciona porque a RPC `validate_ticket_scan` não filtra por driver.

**Correção:** Tornar a busca de trip mais resiliente:
1. Primeiro tentar com filtro de driver (se `driverId` existir)
2. Se retornar 0 trips, fazer fallback sem filtro de driver (apenas por company + status `a_venda`)
3. Isso garante que mesmo que o vínculo driver ↔ trip esteja inconsistente, o motorista veja a lista

Aplicar a mesma lógica no DriverHome.tsx (que tem o mesmo padrão de query).

### Arquivos alterados

- `src/pages/driver/DriverValidate.tsx` — overlay sobre câmera
- `src/pages/driver/DriverBoarding.tsx` — fallback de trip sem filtro de driver
- `src/pages/driver/DriverHome.tsx` — mesma correção de fallback

### Detalhes técnicos

**Overlay (DriverValidate):**
- O overlay fica dentro do `div.relative` do viewport (linha 577)
- Renderizado condicionalmente quando `overlay !== null`
- Botão "Ler próximo" chama `resetOverlay()` que já existe
- Botão "Ver embarque" navega para `/motorista/embarque`
- O scan loop (useEffect linha 500) já para quando `overlay` é truthy

**Query fallback (DriverBoarding + DriverHome):**
```typescript
// Tentar com driver_id primeiro
let trips = await queryWithDriver();
// Se não encontrou, tentar sem filtro de driver
if (!trips?.length && driverId) {
  trips = await queryWithoutDriver();
}
```

