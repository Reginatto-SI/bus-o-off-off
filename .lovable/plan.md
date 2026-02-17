

# Ajustes Finais — QR Code, Vendedor, Pos-Confirmacao e /consultar-passagens

## Resumo

Quatro melhorias no modulo /admin/vendas: (1) acoes de gerar passagem PDF/Imagem no menu "...", (2) campo Vendedor opcional na Nova Venda, (3) tela de sucesso pos-confirmacao com QR Code e botoes de download, (4) garantir que vendas admin aparecam em /consultar-passagens.

---

## Arquivos a modificar

### 1. `src/pages/admin/Sales.tsx`

**1a) Acoes "Gerar Passagem (PDF)" e "Gerar Passagem (Imagem)" no menu "..."**

Na funcao `getSaleActions`, adicionar duas novas acoes para vendas com `status !== 'cancelado'` e `customer_name !== 'BLOQUEIO'`:
- "Gerar Passagem (PDF)" — abre um modal/dialog seletor de passageiro
- "Gerar Passagem (Imagem)" — abre o mesmo seletor mas para imagem

Logica do seletor de passageiro:
- Ao clicar na acao, buscar tickets da venda (`supabase.from('tickets').select('*').eq('sale_id', sale.id)`)
- Se 1 ticket: gerar diretamente sem seletor
- Se multiplos: exibir dialog simples com lista (Nome + Poltrona) + opcao "Baixar todos (PDF)"
- Para gerar, montar `TicketCardData` com dados da venda + empresa (mesma logica de Confirmation.tsx), renderizar QR invisivel com `QRCodeCanvas` offscreen, extrair base64 e chamar `generateTicketPdf` (PDF) ou reproduzir a logica de `handleDownloadImage` do `TicketCard` (Imagem)

Novo state necessario:
- `ticketGenSale: Sale | null` — venda selecionada para gerar passagem
- `ticketGenMode: 'pdf' | 'image'` — modo selecionado
- `ticketGenTickets: TicketRecord[]` — tickets da venda carregados
- `ticketGenLoading: boolean`

Novo componente inline (ou dialog dentro do mesmo arquivo):
- Dialog "Gerar Passagem" com lista de passageiros e botoes de acao

Para construir `TicketCardData` de cada ticket, buscar dados da empresa via `activeCompany` (ja disponivel no contexto) e dados do evento/embarque da venda (ja carregados no `sale` com joins). Para `boardingDepartureTime`, buscar de `event_boarding_locations` (mesma query do detail modal).

**1b) Vendedor no modal de detalhes**

Ja existe `InfoRow label="Vendedor"` no detalhe — esta OK. Nenhuma alteracao necessaria aqui.

---

### 2. `src/components/admin/NewSaleModal.tsx`

**2a) Campo Vendedor (opcional) na aba Venda Manual**

Adicionar:
- State `sellers` (lista de vendedores ativos da empresa) — fetch ao abrir modal
- State `selectedSellerId` (string, vazio por padrao)
- No step 3, aba `manual`, adicionar Select "Vendedor (opcional)" na mesma grid da forma de recebimento e valor unitario (3 colunas: Recebimento / Valor / Vendedor)
- No `handleConfirm`, incluir `seller_id: selectedSellerId || null` no insert de `sales`
- Reset `selectedSellerId` ao abrir/fechar modal

Fetch de vendedores:
```
supabase.from('sellers').select('id, name')
  .eq('company_id', activeCompanyId)
  .eq('status', 'ativo')
  .order('name')
```

**2b) Tela de sucesso pos-confirmacao com QR Code**

Apos `handleConfirm` com sucesso, em vez de fechar o modal imediatamente:
- Adicionar state `confirmationData: { saleId: string; tickets: TicketRecord[]; event: Event; boardingName: string; departureTime: string | null } | null`
- Apos insert de tickets, re-buscar os tickets recem-criados (para pegar `qr_code_token` gerado pelo banco)
- Setar `confirmationData` com os dados
- Exibir step 4 (sucesso) no modal:
  - Icone de sucesso
  - Para cada ticket: QR Code renderizado via `QRCodeCanvas`, nome, poltrona, evento
  - Botoes: "Baixar PDF" e "Baixar Imagem" (reutilizando `generateTicketPdf` e logica do `TicketCard`)
  - Botao "Fechar" que chama `onSuccess()`
- Se multiplos tickets: navegacao por passageiro (tabs ou scroll)
- Construir `TicketCardData` para cada ticket usando dados da empresa via `activeCompany` (precisara receber como prop ou buscar)

Prop adicional necessaria: `company` (dados da empresa ativa, para montar TicketCardData com branding).
Alterar em `Sales.tsx`: passar `company={activeCompany}` para `NewSaleModal`.

**2c) Nao fechar modal no onSuccess atual**

Alterar fluxo: `onSuccess` so e chamado ao clicar "Fechar" no step de sucesso. O `toast.success` continua, mas o modal permanece aberto mostrando as passagens.

---

### 3. Verificacao — /consultar-passagens (TicketLookup.tsx)

Analisando o codigo atual de `TicketLookup.tsx`:
- A busca e feita por `tickets.passenger_cpf` com join em `sales` e filtro por `trip.event_id`
- **Nao ha filtro por status** — retorna todos os tickets (pago, reservado, cancelado)
- **Nao ha filtro por origem** — qualquer ticket criado (admin ou publico) aparece

**Conclusao: a query atual ja funciona corretamente para vendas admin.** O unico requisito e que os dados estejam corretamente inseridos (passenger_cpf limpo, trip_id correto, event_id via trip). A insercao no `NewSaleModal` ja faz isso corretamente:
- `passenger_cpf` e salvo limpo (`.replace(/\D/g, '')`)
- `trip_id` e setado
- `sale_id` aponta para sale com `event_id`
- `qr_code_token` e gerado pelo default do banco

**Nenhuma alteracao necessaria em TicketLookup.tsx.**

Porem, ha um detalhe: o `TicketLookup` busca eventos que possuem tickets, usando uma cadeia `tickets -> trips -> events`. Para vendas admin, os tickets possuem `trip_id` valido, entao o evento aparecera no dropdown. Tudo OK.

---

## Detalhes tecnicos

**Dependencia para gerar QR offscreen no Admin:**
Para gerar PDF/Imagem no menu "...", sera necessario renderizar um `QRCodeCanvas` invisivel (offscreen) para extrair o base64. Abordagem: renderizar dentro do dialog de selecao de passageiro com `style={{ display: 'none' }}` e usar ref para capturar.

**TicketCardData no Admin:**
Para montar o objeto completo para o gerador de PDF, os dados da empresa vem de `activeCompany` (ja disponivel em Sales.tsx via `useAuth`). Os dados do evento e embarque vem do `sale` (ja com joins). O `boardingDepartureTime` precisa de fetch extra (mesma query usada no openDetail).

**Fluxo resumido do Step 4 (sucesso):**
1. Insert sale + tickets
2. Re-fetch tickets recem-criados (para pegar qr_code_token)
3. Fetch boarding departure time
4. Montar array de TicketCardData
5. Exibir no modal com QR + botoes de download
6. Ao clicar "Fechar", chamar onSuccess()

---

## Arquivos

| Arquivo | Tipo |
|---------|------|
| `src/components/admin/NewSaleModal.tsx` | Modificado |
| `src/pages/admin/Sales.tsx` | Modificado |

## Sem alteracoes de banco

Dados e tabelas existentes sao suficientes. TicketLookup.tsx nao precisa de ajuste.

