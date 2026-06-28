## Objetivo

Substituir o visual atual de `TicketCard.tsx` por um layout mobile vertical, fundo azul-marinho escuro, acentos laranja SmartBus e verde apenas para status "Pago", fiel à imagem de referência. Em paralelo, parar de aplicar `ticket_color` / `primary_color` da empresa na passagem virtual e sinalizar isso na aba Identidade Visual.

Nada de regra de negócio muda: QR, status, PDF, geração de tickets, RLS, fluxos de pagamento e dados vindos do banco permanecem idênticos. Só muda apresentação.

## Escopo de arquivos

1. **`src/components/public/TicketCard.tsx`** — reescrita visual completa do card mantendo a mesma assinatura de props (`TicketCardData`, `TicketCardProps`), os mesmos refs (`qrRef`, `ticketContainerRef`) e os mesmos handlers (`handleDownloadPdf`, `handleDownloadImage`, `handleCopySaleId`, `onRefreshStatus`). Remover uso de `ticket.companyPrimaryColor` / `accentColor` dinâmico — passar a usar tokens fixos SmartBus.

2. **`src/components/admin/BrandIdentityTab.tsx`** — manter o campo "Cor principal da passagem" (continua salvando em `ticket_color`, pois `ticketVisualRenderer.ts` e outros lugares ainda consomem), mas adicionar aviso curto e não bloqueante explicando que essa cor **não é mais aplicada na nova passagem virtual SmartBus**, e segue valendo apenas para outros usos visuais legados (PDF antigo / renderer). Não remover o campo nem migration.

3. **`src/index.css`** — adicionar tokens fixos da passagem SmartBus (apenas escopados ao card), sem mexer em tokens globais:
   - `--ticket-bg`, `--ticket-surface`, `--ticket-border`, `--ticket-text`, `--ticket-muted`, `--ticket-accent` (laranja SmartBus `#F97316`), `--ticket-success` (verde `#22C55E`).

4. **`docs/Analises/analise-redesign-passagem-virtual.md`** — relatório obrigatório (padrão do projeto) descrevendo a alteração visual, o porquê de descontinuar a cor personalizada na passagem, arquivos alterados, compatibilidade e testes.

Não tocar em: `ticketPdfGenerator.ts`, `ticketImageGenerator.ts`, `ticketVisualRenderer.ts`, edge functions, schema, RLS, ou lógica de QR.

## Estrutura visual (mobile vertical, largura máx ~420px, centralizado em desktop)

```text
┌──────────────────────────────────────────┐
│ 🎟 Passagem digital                      │  Cabeçalho (ícone laranja + título branco)
│   Apresente este bilhete no embarque     │  Subtítulo cinza claro
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ 👤  Nome do passageiro principal     │ │  Card resumo
│ │     CPF: ***.209.226-**              │ │  (fundo --ticket-surface,
│ │ ──────────────────────────────────── │ │   borda --ticket-border)
│ │  [💺 16]   [↔ Ida e Volta]  [✓ Pago] │ │  3 blocos: Assento / Tipo / Status
│ └──────────────────────────────────────┘ │
│                                          │
│ [WhatsApp]  [Salvar PDF]  [Salvar QR]    │  3 botões (WhatsApp condicional)
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ SmartBus BR        [LOGO EMPRESA]    │ │  Card principal:
│ │ VIAGENS & PASSEIOS  7 FEST           │ │  identidade
│ │                     CNPJ/Cidade/Tel  │ │
│ │ ──── divisória laranja fina ──────── │ │
│ │                                      │ │
│ │            [ QR CODE ]               │ │  QR centralizado, fundo branco
│ │       Apresente no embarque          │ │
│ │ ──── divisória ───────────────────── │ │
│ │ PASSAGEIRO       │ BILHETE           │ │  Grid 2 colunas (empilha < 360px)
│ │ ──── divisória ───────────────────── │ │
│ │ EVENTO                               │ │
│ │ ──── divisória ───────────────────── │ │
│ │ EMBARQUE                             │ │
│ │ ──── divisória ───────────────────── │ │
│ │ INFORMAÇÕES DO VEÍCULO (3 blocos)    │ │
│ │ ──── divisória ───────────────────── │ │
│ │ OBSERVAÇÕES OPERACIONAIS             │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ Rodapé: operado por / plataforma /   │ │
│ │ texto legal / gerado por             │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

Títulos de seção (`PASSAGEIRO`, `BILHETE`, `EVENTO`, `EMBARQUE`, `INFORMAÇÕES DO VEÍCULO`, `OBSERVAÇÕES OPERACIONAIS`) em laranja SmartBus, tipografia caixa alta tracking-wide.

## Detalhes técnicos

- **Cor fixa**: ignorar `ticket.companyPrimaryColor` no JSX. Acento sempre `var(--ticket-accent)`. Status "Pago" sempre verde. Substituir todas as referências a `accentColor` no componente por tokens fixos.
- **Container raiz**: `Card` substituído por `<div>` com `bg-[hsl(var(--ticket-bg))] text-[hsl(var(--ticket-text))] rounded-2xl max-w-[420px] mx-auto`. Mantém `ref={ticketContainerRef}` (PDF html2canvas continua funcionando).
- **Reservado/cancelado/processando**: preservar exatamente os estados atuais (`isReservedReceipt`, `isCancelled`, `displayStatus`, `showRefreshButton`, alert de QR indisponível). Só re-skinar visualmente para o tema escuro.
- **Botões**: usar `Button` shadcn com variantes adaptadas; WhatsApp só aparece quando `ticket.whatsappGroupLink && ticket.saleStatus === 'pago' && showWhatsAppGroupCta`. PDF e QR sempre quando `canDownload`.
- **Ícones**: usar lucide-react já importado (`Ticket`, `User`, `Armchair`, `ArrowLeftRight`, `FileText`, `QrCode`, `Phone`, `MapPin`, `Calendar`, `Clock`, `Bus`, `Hash`, `Info`, `Star`). Adicionar `IdCard` para placa, ou caso indisponível, manter um SVG inline minimalista.
- **WhatsApp**: usar `src/components/ui/WhatsAppIcon.tsx` que já existe (ícone oficial).
- **Logo SmartBus**: usar `@/components/Logo` com variante apropriada (já existe). Logo da empresa permanece como `<img src={ticket.companyLogoUrl}>` em área controlada de ~48–56px.
- **Responsividade**: passagem é sempre mobile-shape (`max-w-[420px]`). Em desktop, centraliza, sem expandir.
- **Compatibilidade PDF**: `ticketPdfGenerator` usa html2canvas sobre `ticketContainerRef` → o novo visual será capturado automaticamente. `ticketVisualRenderer.ts` (canvas alternativo) não é alterado e continua usando `ticket_color` (uso legado, não impacta a tela).

## Política de cor da empresa

- Campo "Cor principal da passagem" em `BrandIdentityTab` continua salvando `companies.ticket_color` (não quebra dados existentes nem migration).
- Adicionar aviso curto abaixo do campo: *"Esta cor não é mais aplicada na nova passagem virtual SmartBus. A passagem segue o padrão visual oficial da plataforma."*
- Nenhum dado é apagado. Nenhum campo removido. Nenhuma migration.
- `primary_color` e `accent_color` continuam intactos e seguem afetando vitrine pública e branding dinâmico — fora do escopo desta mudança.

## O que não muda

- `TicketCardData` (mesmas propriedades).
- Geração de QR, validação, PDF, imagem PNG.
- Fluxo de status (`pago`, `reservado`, `cancelado`, `processando`).
- `onRefreshStatus`, polling, alerts de reserva e cancelamento.
- Regras de WhatsApp condicional e exibição de número global da passagem.
- Lista agrupada `PassengerTicketList.tsx` (apenas consome `TicketCard`, não precisa alteração).
- Edge functions, RLS, schema, types.

## Testes manuais

1. `/confirmacao/:id` com venda `pago` → ver a nova passagem escura no mobile (DevTools 390px) e desktop centralizada.
2. Conferir QR escaneando com câmera real (validação via `/validador`).
3. Salvar PDF → conferir layout do novo card no PDF gerado.
4. Salvar só QR Code → arquivo PNG continua sendo só o QR.
5. WhatsApp condicional: passagem com `whatsappGroupLink` → botão aparece em verde; sem link → some.
6. Venda `reservado` (com pagamento pendente) → alerta amarelo de QR indisponível continua funcionando, botão "Atualizar status" presente.
7. Venda `cancelado` → faixa CANCELADA aparece sobre QR e opacidade reduzida.
8. `/admin/empresa` → aba Identidade Visual → aviso novo aparece em "Cor principal da passagem"; mudar a cor lá **não** afeta mais o card em `/confirmacao`.
9. Empresa com `companyLogoUrl` ausente → área da logo não quebra layout.
10. Smoke test em iOS PWA standalone e Android TWA via `/confirmacao/:id` real.

## Critérios de aceite

- Visual da passagem em `/confirmacao` corresponde à referência (cabeçalho, card passageiro, 3 botões, card principal com QR centralizado, seções, rodapé).
- Largura máx ~420px, sempre vertical, fundo escuro fixo.
- Nenhuma cor da empresa é aplicada como fundo/borda/destaque do card.
- Botões salvar PDF e salvar QR continuam gerando os mesmos arquivos.
- Build passa, nenhum teste existente quebra.
- Relatório `docs/Analises/analise-redesign-passagem-virtual.md` criado.
