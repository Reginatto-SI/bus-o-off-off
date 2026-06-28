# Análise — Redesign da Passagem Virtual SmartBus BR

## 1. Objetivo

Substituir o visual antigo do `TicketCard` (claro, com cor da empresa como acento)
por um modelo fixo SmartBus em layout mobile vertical, fundo azul-marinho escuro,
acentos laranja SmartBus e verde apenas para status "Pago", seguindo a imagem de
referência fornecida pelo usuário.

A nova passagem é tratada como passagem oficial da plataforma — a empresa entra
como operadora/organizadora, mas não controla mais a identidade visual.

## 2. Arquivos alterados

- `src/index.css` — adição de tokens fixos da passagem (`--ticket-bg`,
  `--ticket-surface`, `--ticket-surface-2`, `--ticket-border`, `--ticket-text`,
  `--ticket-muted`, `--ticket-accent`, `--ticket-success`, `--ticket-success-bg`).
  Tokens são exclusivos do card; nenhum token global foi alterado.
- `src/components/public/TicketCard.tsx` — reescrita visual completa. Mantida a
  assinatura de `TicketCardData`, `TicketCardProps`, `qrRef`, `ticketContainerRef`
  e handlers (`handleDownloadPdf`, `handleDownloadImage`, `handleCopySaleId`,
  `onRefreshStatus`). Removido o uso de `ticket.companyPrimaryColor` no JSX.
- `src/components/admin/BrandIdentityTab.tsx` — adicionado aviso não bloqueante
  na seção "Cores da Passagem" informando que a cor não é mais aplicada na nova
  passagem virtual SmartBus.
- `docs/Analises/analise-redesign-passagem-virtual.md` — este relatório.

## 3. O que mudou no visual

- Layout sempre mobile vertical, `max-w-[420px]`, centralizado em desktop.
- Fundo `--ticket-bg` (azul-marinho/grafite escuro).
- Cabeçalho "Passagem digital" com ícone de bilhete laranja.
- Card resumo do passageiro com 3 blocos: Assento, Tipo de viagem, Status.
- Três botões de ação: Entrar no grupo do WhatsApp (condicional ao link),
  Salvar PDF, Salvar só QR Code.
- Card principal contendo identidade SmartBus à esquerda + identidade da empresa
  à direita (com logo, CNPJ, cidade, telefone e WhatsApp).
- QR Code grande, com fundo branco, centralizado, com legenda
  "Apresente o QR Code no embarque".
- Seções claramente divididas por linhas laranja finas: PASSAGEIRO, BILHETE,
  EVENTO, EMBARQUE, INFORMAÇÕES DO VEÍCULO, OBSERVAÇÕES OPERACIONAIS.
- Bloco rodapé institucional preservado (texto legal SmartBus BR).

## 4. O que NÃO mudou

- Geração de QR Code e validação operacional.
- Lógica de pagamento, status da venda e webhook.
- Geração de PDF (`ticketPdfGenerator` continua usando `ticketContainerRef`).
- Geração de imagem do QR (`ticketImageGenerator`).
- Renderer de canvas legado (`ticketVisualRenderer.ts`) — continua consumindo
  `ticket_color` para usos legados.
- Schema do banco, RLS, edge functions, tipos.
- `PassengerTicketList.tsx` consome `TicketCard` sem alteração.

## 5. Descontinuação da cor personalizada

A cor personalizada da empresa (`companies.ticket_color`) **não é mais aplicada
na passagem virtual**. Motivos:

- Evitar passagens com baixo contraste ou aparência amadora.
- Garantir consistência visual em todas as empresas (multi-tenant).
- Padronizar o ticket como produto oficial SmartBus BR.

O campo continua existindo no banco e na tela de configuração (sem migration)
para não quebrar dados de empresas existentes e por compatibilidade com usos
legados do renderer.

A empresa continua personalizando livremente:
- logomarca, nome, CNPJ, cidade/UF, telefone e WhatsApp;
- dados de evento, embarque e veículo.

## 6. Compatibilidade

- `companyPrimaryColor` em `TicketCardData` foi mantido para não quebrar
  consumidores. Está marcado como `@deprecated` no componente.
- Empresas existentes continuam exibindo logomarca normalmente.
- Empresas sem `companyLogoUrl` não quebram o layout — a área da logo
  simplesmente não é renderizada.
- Estados `pago`, `reservado`, `processando` e `cancelado` continuam funcionando.
- Comprovante de reserva (`reservedPresentation='receipt'`) mantido com
  visual amber dark adaptado.

## 7. Testes manuais sugeridos

1. `/confirmacao/:id` venda paga em DevTools 390px e desktop.
2. Salvar PDF → conferir captura do novo card.
3. Salvar QR Code → arquivo PNG continua sendo só o QR.
4. WhatsApp condicional aparece quando há link e venda paga.
5. Venda reservada com `asaas_payment_id` → status "Processando" amarelo +
   botão "Atualizar status do pagamento".
6. Venda cancelada → faixa CANCELADA sobre QR.
7. `/admin/empresa` → aba Identidade Visual → aviso amarelo aparece.
8. Mudar cor da passagem em Identidade Visual e confirmar que ela **não**
   afeta mais o card em `/confirmacao`.
9. iOS PWA standalone e Android TWA via `/confirmacao/:id` real.

## 8. Riscos remanescentes

- O renderer canvas legado (`ticketVisualRenderer.ts`) continua usando
  `ticket_color`. Se algum fluxo ainda dispara esse renderer (PDF antigo),
  o resultado visual será diferente do card novo. O fluxo principal do PDF
  da passagem usa `html2canvas` sobre `ticketContainerRef`, portanto o PDF
  oficial reflete o novo visual.
- Caso seja decidido remover totalmente a personalização, basta deprecar o
  campo `ticket_color` em uma etapa futura — não é necessário para este ajuste.
