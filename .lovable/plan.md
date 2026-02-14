

# Reestruturacao Profissional White-Label -- Passagens com Identidade Total da Empresa

## Diagnostico dos dados

**Campos ja existentes na tabela `companies`:**
- `name`, `trade_name` (razao social / nome fantasia)
- `cnpj`
- `phone`, `whatsapp`
- `address`, `city`, `state`
- `logo_url`
- `primary_color`

**Campo inexistente:** `slogan` (nao existe). Sera adicionado como campo opcional via migracao.

Nenhuma alteracao em logica de pagamento, QR Code ou webhook.

---

## 1. Migracao de banco

Adicionar coluna `slogan` na tabela `companies`:

```sql
ALTER TABLE public.companies ADD COLUMN slogan text;
```

Campo opcional. Se preenchido, substitui as frases motivacionais fixas no PDF.

---

## 2. Ampliar TicketCardData com dados completos da empresa

Novos campos no tipo `TicketCardData`:

- `companyCnpj: string | null`
- `companyPhone: string | null`
- `companyWhatsapp: string | null`
- `companyAddress: string | null`
- `companySlogan: string | null`

**Arquivo:** `src/components/public/TicketCard.tsx`

---

## 3. TicketCard -- Redesenho visual profissional

### Cabecalho do card:
- Logo (maior, ~48px) a esquerda
- Nome da empresa em destaque (font-semibold, tamanho maior)
- CNPJ formatado abaixo do nome
- Cidade/UF
- Telefone e WhatsApp com icones discretos (Phone, MessageCircle)
- Barra superior colorida com `primary_color`

### Corpo:
- QR Code centralizado (sem alteracao de logica)
- Badge de status refinado
- Blocos de informacao organizados

### Imagem QR (handleDownloadImage):
- Topo: nome da empresa, cidade/UF, CNPJ (fonte menor)
- Centro: QR Code grande
- Base: evento, assento, data
- Layout de mini-ingresso profissional

**Arquivo:** `src/components/public/TicketCard.tsx`

---

## 4. PDF -- Redesenho profissional

### Cabecalho:
- Logo da empresa (esquerda)
- Nome da empresa em destaque
- CNPJ formatado
- Endereco (se existir)
- Telefone | WhatsApp
- Cidade/UF
- Linha divisoria elegante
- Frase: slogan da empresa (se existir) ou frase motivacional rotativa

### Corpo:
- QR Code centralizado (tamanho confortavel)
- Badge "PAGA" com cantos arredondados e cor solida
- Blocos organizados: Evento, Data, Passageiro, CPF mascarado, Assento, Local de embarque, Horario

### Rodape:
- Apenas "Documento emitido digitalmente."

**Arquivo:** `src/lib/ticketPdfGenerator.ts`

---

## 5. Tela de Confirmacao

- Buscar dados completos da empresa (incluindo cnpj, phone, whatsapp, address, slogan)
- Propagar todos os novos campos para cada TicketCard
- Bloco de identidade da empresa no topo dos tickets com dados completos

**Arquivo:** `src/pages/public/Confirmation.tsx`

---

## 6. Tela Consultar Passagens

- Buscar dados completos da empresa
- Bloco de identidade com CNPJ, telefone, WhatsApp
- Propagar dados completos para cada TicketCard

**Arquivo:** `src/pages/public/TicketLookup.tsx`

---

## Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/public/TicketCard.tsx` | Ampliar tipo, redesenho do card com dados completos, redesenho da imagem QR |
| `src/lib/ticketPdfGenerator.ts` | Cabecalho com dados completos da empresa, slogan, layout profissional |
| `src/pages/public/Confirmation.tsx` | Buscar e propagar cnpj, phone, whatsapp, address, slogan |
| `src/pages/public/TicketLookup.tsx` | Buscar e propagar dados completos, bloco de identidade melhorado |
| `src/types/database.ts` | Atualizar tipo Company se necessario |

## Migracao de banco

| Alteracao | Descricao |
|-----------|-----------|
| Coluna `slogan` em `companies` | Campo texto opcional para frase personalizada |

## O que NAO sera alterado

- Logica de pagamento, QR Code ou webhook
- Estrutura de rotas
- Componentes do painel administrativo
- StatusBadge (reutilizado como esta)

