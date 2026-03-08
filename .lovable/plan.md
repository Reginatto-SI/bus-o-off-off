

## Plano: Reposicionar Parceiros e Patrocinadores na Passagem

Mover os blocos de **Parceiros oficiais** e **Patrocinadores do evento** para **antes das Observações Operacionais** (e após Informações do Veículo), em ambos os arquivos de renderização.

### Mudanças

#### 1. `src/components/public/TicketCard.tsx`

Mover as linhas 294-336 (blocos de parceiros + patrocinadores) para **antes** da linha 288 (bloco de Observações Operacionais).

Nova ordem dentro do `<div className="w-full space-y-2 text-sm">`:
1. Dados do Passageiro
2. Evento
3. Embarque
4. Informações do Veículo
5. **Parceiros oficiais** ← movido
6. **Patrocinadores do evento** ← movido
7. Observações Operacionais
8. Fee breakdown / Total pago

#### 2. `src/lib/ticketVisualRenderer.ts`

Mover os blocos de canvas das linhas 306-372 (Commercial Partners + Event Sponsors) para **antes** do bloco "Observações Operacionais" (linha 286-304).

Nova ordem no canvas:
1. ... Vehicle/Driver info (termina ~linha 284)
2. **Parceiros oficiais** ← movido
3. **Patrocinadores do evento** ← movido
4. Observações Operacionais
5. Fee breakdown

Nenhuma alteração de lógica, dados, queries ou estilos — apenas reordenação de blocos JSX e canvas.

