
# Ajustes — /admin/vendas (Mascaras, Transporte, Confirmar, Poltrona)

## Resumo

Corrigir 5 problemas no fluxo de Nova Venda e na listagem/detalhe de vendas: mascaras de CPF/telefone, label de transporte sem "Ida/Volta", bug do botao Confirmar, coluna Poltrona(s) na tabela, e Poltrona no modal de detalhes.

---

## Alteracoes

### 1. `src/components/admin/NewSaleModal.tsx`

**1a) Mascaras CPF e Telefone (Step 3 — passageiros)**

Adicionar funcoes `formatCpfMask` e `formatPhoneMask` identicas as de `Checkout.tsx`:

```
function formatCpfMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3) + '.' + d.slice(3);
  if (d.length <= 9) return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6);
  return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6,9) + '-' + d.slice(9);
}

function formatPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return '(' + d.slice(0,2) + ') ' + d.slice(2);
  return '(' + d.slice(0,2) + ') ' + d.slice(2,7) + '-' + d.slice(7);
}
```

No `updatePassenger`, aplicar mascaras:
- Campo `cpf`: usar `formatCpfMask(value)` em vez de `value.replace(/\D/g, '').slice(0, 11)`
- Campo `phone`: usar `formatPhoneMask(value)`

Na validacao `canConfirm`, ja esta usando `p.cpf.replace(/\D/g, '')` para extrair digitos — isso funciona com mascaras. Sem alteracao necessaria na validacao.

No `handleConfirm`, ja usa `p.cpf.replace(/\D/g, '')` — tambem ja funciona.

**1b) Transporte sem "Ida/Volta"**

Na linha ~458-461, remover o trecho `{t.trip_type === 'volta' ? ' (Volta)' : ''}` do label do SelectItem de transporte. Manter apenas: `Tipo + Placa + Capacidade + Motorista`.

**1c) Bug do botao Confirmar**

O problema: na aba Bloqueio, o CPF e pre-preenchido como `'00000000000'` (11 digitos sem mascara). Na validacao `canConfirm`, o bloco `if (!isBlock)` protege corretamente — para bloqueio nao valida nome/cpf. Entao bloqueio ja deveria funcionar.

Para Venda Manual e Reserva: o CPF e inicializado como `''`. Quando o usuario digita com mascara (ex: `123.456.789-00`), `p.cpf.replace(/\D/g, '')` extrai 11 digitos — a validacao passa. Isso ja esta correto.

O problema real: na aba **Reserva**, a validacao exige `parseFloat(unitPrice)` valido apenas para `activeTab === 'manual'`. Mas `unitPrice` e inicializado como `''` no `initPassengers` e so e preenchido com `selectedEvent.unit_price`. Verificar: se `selectedEvent` existe, `unitPrice` e preenchido. Para reserva, a condicao `if (activeTab === 'manual')` nao e avaliada, entao nao bloqueia. Parece correto.

Verificacao adicional: o botao usa `disabled={!canConfirm}`. O `canConfirm` exige `passengers.length > 0`. Se o usuario nao preencheu nome, retorna false. Se preencheu nome e CPF com mascara (11 digitos limpos), retorna true.

O bug pode estar no fato de que o CPF com mascara esta sendo comparado incorretamente. Vou garantir que a logica esta robusta e adicionar log de debug temporario se necessario. Mas o ajuste principal e garantir que a mascara funciona corretamente no `updatePassenger`.

**Ajuste real no `canConfirm`:** Verificar se ha um edge case com `unitPrice` vazio para manual. Atualmente `parseFloat('')` retorna `NaN`, e `isNaN(NaN) || NaN < 0` e `true`, logo retorna `false`. Isso e correto — obriga preco. Mas se o usuario nao altera o preco pre-preenchido, pode haver um problema de timing. Garantir que `unitPrice` e setado no `initPassengers`.

---

### 2. `src/pages/admin/Sales.tsx`

**2a) Coluna Poltrona(s) na tabela**

- Na query `fetchSales`, ja faz join com tickets? Nao. Precisa buscar tickets para cada venda ou fazer um fetch separado.
- Abordagem eficiente: fazer uma query separada de tickets agrupados por `sale_id` apos carregar as vendas, ou incluir na query principal.
- Abordagem mais simples: ao carregar vendas, fazer um segundo fetch de todos os tickets da empresa para mapear `sale_id -> seat_labels[]`.

Implementacao:
- Apos `fetchSales`, buscar `tickets` com `select('sale_id, seat_label')` filtrado por `company_id`
- Criar um Map `saleId -> string[]` de seat_labels
- Usar na tabela com formato compacto: ate 3 labels + `+N`

- Adicionar coluna "Poltrona(s)" entre "Qtd" e "Valor" (ou apos "Cliente")
- Formato: `28, 29, 30 +2` com Tooltip para lista completa

**2b) Poltrona(s) no modal de detalhes**

- Aba "Dados da Venda": adicionar InfoRow "Poltrona(s)" usando `detailTickets` (ja carregados)
- Aba "Passageiros": ja mostra `seat_label` na coluna "Assento" — esta OK

**2c) Mascaras no Edit Passenger Modal**

- Aplicar `formatCpfMask` no campo CPF do modal de edicao de passageiro
- Ao salvar, usar `replace(/\D/g, '')` para limpar antes de enviar ao banco

---

## Arquivos

| Arquivo | Tipo |
|---------|------|
| `src/components/admin/NewSaleModal.tsx` | Modificado |
| `src/pages/admin/Sales.tsx` | Modificado |

## Sem alteracoes de banco

Usa dados ja existentes nas tabelas `tickets` e `sales`.
