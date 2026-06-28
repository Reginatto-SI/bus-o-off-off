## Refinamento Visual — Passagem Virtual SmartBus BR

Refinamento puramente de UI sobre o redesign atual. Sem mudanças em pagamento, QR, PDF, webhook, schema, RLS ou edge functions.

### 1. Botão WhatsApp dentro da passagem (remover duplicidade externa)

**`src/components/public/PassengerTicketList.tsx`**
- Remover o bloco `Alert` "Grupo WhatsApp do evento" renderizado acima da lista (linhas que iteram `paidWhatsAppGroupLinks` com `<Alert>`).
- Em todas as chamadas a `<TicketCard …>` trocar `showWhatsAppGroupCta={false}` por `showWhatsAppGroupCta={true}` (ou remover a prop — default já é `true`).
- Manter import `Alert/MessageCircle/ExternalLink` somente se ainda usados; senão limpar.

**`src/components/public/TicketCard.tsx`** (área dos botões de ação dentro do card escuro)
- O botão de WhatsApp já existe (linha ~280). Refinar visual para casar com PDF / Salvar QR:
  - Mesma altura/padding/raio dos demais.
  - Fundo escuro (`bg-[hsl(var(--ticket-surface-2))]`) com borda verde (`border-[hsl(var(--ticket-success))]/60`) e texto/ícone verde (`text-[hsl(var(--ticket-success))]`); hover sutil.
  - Texto em linha única "Entrar no grupo do WhatsApp" (sem `<br/>`).
  - Layout dos 3 botões: `grid grid-cols-1 sm:grid-cols-3 gap-2` no mobile pode quebrar; manter dentro da largura máxima da passagem (420px).
- Condicional: renderizar apenas se `ticket.whatsappGroupLink && isPaid`.

### 2. Modal "Gerar Passagem" no padrão escuro SmartBus

**`src/components/admin/NewSaleModal.tsx`** (apenas o estado de exibição de passagens — após geração)
- No `DialogContent` desse estado (linhas 1288–1342) aplicar fundo escuro do tema da passagem: `bg-[hsl(var(--ticket-bg))] text-[hsl(var(--ticket-text))]` no container e header/footer com borda `border-[hsl(var(--ticket-border))]`.
- DialogTitle e textos auxiliares em branco/cinza claro.
- Botões do footer mantêm comportamento; ajustar variantes para boa leitura sobre fundo escuro.
- Não tocar nas etapas anteriores do wizard (passos de cadastro continuam claros).

**`src/components/public/PassengerTicketList.tsx`** (cards do accordion por passageiro)
- `PassengerCollapsibleCard` → trocar `bg-card` / `hover:bg-accent/50` / `border-primary/30 bg-accent/30` por classes no tema da passagem:
  - card: `bg-[hsl(var(--ticket-surface))] border-[hsl(var(--ticket-border))] text-[hsl(var(--ticket-text))]`
  - ícone passageiro: fundo `bg-[hsl(var(--ticket-accent))]/15` e ícone `text-[hsl(var(--ticket-accent))]`.
  - subtítulo/CPF/assento: `text-[hsl(var(--ticket-muted))]`.
  - badge "Ida e Volta" em laranja accent.
- StatusBadge "Pago": forçar variante verde compatível com tema (passar `className` override se preciso, sem alterar lógica).
- Manter largura máxima da passagem expandida (`max-w-[420px] mx-auto`) inclusive no desktop.

### 3. Logo SmartBus branca dentro da passagem

**`src/components/Logo.tsx`**
- Adicionar prop opcional `variant?: 'default' | 'white'`.
- Quando `variant='white'`: renderizar SVG inline branco com o lockup "SmartBus BR / VIAGENS & PASSEIOS" (mesma proporção da landing), em vez do `logo.png`. Texto em `currentColor` para herdar branco.

**`src/components/public/TicketCard.tsx`**
- Substituir `<Logo size="sm" />` (linha ~321, dentro do header escuro do card) por `<Logo size="sm" variant="white" className="text-white" />`.

### 4. Identidade da empresa apenas como conteúdo

Sem mudanças adicionais — `companyPrimaryColor` já está deprecado e não é mais aplicado. Apenas confirmar que nenhum estilo novo passe a usar `ticket.companyPrimaryColor`.

### 5. Guardrails

- Não alterar `handleDownloadPdf`, `handleDownloadImage`, `qrRef`, `ticketContainerRef`, `onRefreshStatus`, props públicas de `TicketCard` (exceto default de `showWhatsAppGroupCta`, que continua `true`).
- Não tocar em edge functions, schema, RLS, geração de QR/PDF.
- Tokens `--ticket-*` em `index.css` permanecem fonte única de verdade — sem novas cores hardcoded.

### Arquivos alterados

1. `src/components/public/PassengerTicketList.tsx` — remove Alert externo de WhatsApp; cards escuros.
2. `src/components/public/TicketCard.tsx` — botão WhatsApp refinado, logo white.
3. `src/components/Logo.tsx` — variante white (SVG inline).
4. `src/components/admin/NewSaleModal.tsx` — modal escuro no estado de passagens geradas.

### Testes manuais

- Passagem com link de grupo: botão aparece dentro da passagem; card externo sumiu.
- Passagem sem link: botão não aparece, PDF/QR continuam.
- Salvar PDF e Salvar só QR Code funcionam (visual escuro capturado).
- Modal "Gerar Passagem" com 1 e 2 passageiros em visual escuro consistente.
- Expandir/recolher passageiro sem quebrar layout.
- Logo branca visível na passagem; logo da empresa preservada à direita.
- Mudar `ticket_color` na Identidade Visual não afeta a passagem.
- Testar 390px mobile e desktop (passagem permanece centralizada em largura mobile).
