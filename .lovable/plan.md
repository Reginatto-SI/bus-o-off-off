

## Plano: Ocultar ações indevidas quando taxa da plataforma está pendente

### Alteração

Arquivo: `src/pages/admin/Sales.tsx`, função `getSaleActions` (linha ~872).

Adicionar verificação do `platform_fee_status` para ocultar condicionalmente as ações que não fazem sentido enquanto a taxa está pendente.

### Lógica

```
const feeStatus = (sale as any).platform_fee_status;
const feePending = feeStatus === 'pending' || feeStatus === 'failed';
```

Usar `feePending` como guard nas seguintes ações:

- **"Copiar Link"** (linha 875): só adicionar se `!feePending`
- **"Gerar Passagem"** (linha 880): adicionar condição `&& !feePending`
- **"Marcar como Pago"** (linha 907): adicionar condição `&& !feePending`

Ações que permanecem sempre visíveis:
- **"Ver Detalhes"**: sempre
- **"Cancelar Venda"**: sempre (exceto canceladas)
- **"Pagar Taxa"**: já aparece apenas quando fee está pendente/failed

### Resultado

Menu com taxa pendente: Ver Detalhes, Cancelar Venda, Pagar Taxa.
Menu com taxa quitada/não aplicável: todas as ações normais.

Nenhuma mudança de lógica ou proteção — apenas visibilidade do menu.

