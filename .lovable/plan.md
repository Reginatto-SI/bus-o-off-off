

# Passagem com QR Code -- Validacao de embarque + salvar/compartilhar

## Resumo

Implementar QR Codes unicos por passagem (ticket), exibi-los na tela de confirmacao pos-pagamento, criar uma tela publica de consulta de passagens (sem login), e permitir salvar como PDF e imagem.

---

## 1. Banco de dados

### Adicionar coluna `qr_code_token` na tabela `tickets`

- Tipo: `text`, NOT NULL, com default `gen_random_uuid()` (gera automaticamente um UUID v4 unico)
- Adicionar indice unico para garantir que nenhum token se repita
- Esse token sera o conteudo do QR Code (UUID seguro, impossivel de "chutar")

```sql
ALTER TABLE public.tickets
  ADD COLUMN qr_code_token text NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX idx_tickets_qr_code_token ON public.tickets (qr_code_token);
```

Motivo: UUID v4 tem 122 bits de entropia, impossivel de adivinhar. O motorista/ajudante, ao escanear o QR, buscara o ticket pelo `qr_code_token`.

---

## 2. Biblioteca de QR Code (frontend)

Instalar `qrcode.react` para renderizar QR Codes como componentes React (SVG/Canvas).

---

## 3. Tela de Confirmacao (`/confirmacao/:id`) -- Evolucao

### Quando `sale.status === 'pago'`:
- Exibir cada ticket em um card individual contendo:
  - QR Code (tamanho confortavel, ~180px)
  - Nome do passageiro
  - CPF mascarado (ex: `***.456.789-**`)
  - Assento
  - Evento + data
  - Local e horario de embarque
  - Badge "Paga"

### Quando `sale.status !== 'pago'`:
- Manter comportamento atual (sem QR Code)
- Texto "Aguardando confirmacao de pagamento"

### Quando `sale.status === 'cancelado'`:
- Mostrar badge "Cancelada" e QR Code com opacity reduzida (historico visual)

### Botoes de acao (somente quando pago):
- **"Salvar passagem (PDF)"** -- gera um PDF por passageiro com QR Code, dados da passagem e informacoes de embarque usando `jspdf`
- **"Salvar QR Code (imagem)"** -- baixa PNG do QR Code + dados minimos (evento + assento + nome) usando canvas

### Implementacao tecnica:
- Buscar tickets com o novo campo `qr_code_token` na query existente
- Usar `qrcode.react` para renderizar QR com valor = `qr_code_token`
- Para o PDF: renderizar QR em canvas offscreen, converter para base64, inserir no jspdf junto com os dados textuais
- Para a imagem: criar canvas com QR + texto sobreposto, converter para PNG e disparar download

---

## 4. Nova pagina: Consultar Passagens (`/consultar-passagens`)

### Rota: `/consultar-passagens`

### Fluxo:
1. Usuario seleciona evento (dropdown com eventos `a_venda` ou `encerrado`)
2. Informa CPF
3. Sistema busca tickets onde `passenger_cpf` = CPF informado e `trip.event_id` = evento selecionado
4. Exibe lista de cards com QR Code e dados de cada passagem

### Regras:
- Sem login (tela publica)
- Busca via `tickets` com join em `sales` e `events`
- Exibir status visual (Paga / Cancelada)
- Mesmos botoes de salvar PDF e imagem

### RLS: as politicas atuais ja permitem SELECT publico em tickets (`true`), sales (`true`) e events (`status = 'a_venda'`). Para eventos encerrados, sera necessario ajustar a politica de SELECT em events para incluir `encerrado` na consulta publica, ou buscar via tickets diretamente (que ja tem acesso publico irrestrito).

---

## 5. Componente reutilizavel: `TicketCard`

Criar `src/components/public/TicketCard.tsx` que encapsula:
- Renderizacao do QR Code
- Dados do passageiro
- Botoes de salvar (PDF e imagem)

Esse componente sera usado tanto na Confirmacao quanto na Consulta de Passagens.

---

## 6. Funcao utilitaria: Gerar PDF da passagem

Criar `src/lib/ticketPdfGenerator.ts`:
- Recebe dados do ticket + evento + embarque
- Gera PDF em formato retrato (A5 ou similar, bom para mobile)
- Inclui: QR Code grande, dados textuais, identidade visual da empresa
- Reutiliza helpers de `pdfUtils.ts` (logo, cores, formatacao)

---

## 7. Envio por e-mail (adiado)

O item 5.3 (enviar por e-mail) sera **preparado estruturalmente** mas nao implementado agora, pois requer uma edge function de envio de email e configuracao de provedor. O botao pode ser adicionado como "Em breve" ou implementado numa proxima iteracao.

---

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/public/TicketCard.tsx` | Card reutilizavel com QR Code + dados + botoes |
| `src/lib/ticketPdfGenerator.ts` | Gerador de PDF individual da passagem |
| `src/pages/public/TicketLookup.tsx` | Pagina publica de consulta de passagens |

## Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/public/Confirmation.tsx` | Exibir TicketCard para cada ticket quando pago, botoes de acao |
| `src/App.tsx` | Adicionar rota `/consultar-passagens` |
| `src/types/database.ts` | Adicionar `qr_code_token` ao `TicketRecord` |
| `src/components/layout/PublicLayout.tsx` | Adicionar link "Consultar Passagens" na navegacao publica (se houver) |

## Migracao de banco

- Adicionar coluna `qr_code_token` com default UUID em `tickets`
- Indice unico na coluna

## Dependencia nova

- `qrcode.react` (renderizacao de QR Code no React)

