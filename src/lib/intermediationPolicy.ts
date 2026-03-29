// Centraliza os textos institucionais de intermediação para manter consistência jurídica
// entre evento, checkout, confirmação, ticket e futuras reutilizações (ex.: rodapé).
export const SMARTBUS_PLATFORM_SHORT_NOTICE =
  'A Smartbus BR atua como plataforma intermediadora de venda de passagens. A execução do transporte, cancelamentos e reembolsos são de responsabilidade da empresa organizadora do evento.';

export const getTransportResponsibilityIntro = (companyName: string) =>
  `Este transporte é organizado e operado por ${companyName}. A Smartbus BR atua exclusivamente como plataforma intermediadora para divulgação, gestão e venda de passagens.`;

export const TRANSPORT_RESPONSIBILITY_DETAILS =
  'Questões relacionadas à execução do transporte, horários, embarque, atrasos, cancelamentos, alterações e reembolsos são de responsabilidade da empresa organizadora.';

export const getCheckoutResponsibilityAcceptanceLabel = (companyName: string) =>
  `Declaro que estou comprando uma passagem operada por ${companyName} e que li as informações de responsabilidade da plataforma e da empresa organizadora.`;

export const CHECKOUT_RESPONSIBILITY_HELPER_TEXT =
  'A Smartbus BR atua exclusivamente como plataforma intermediadora da venda. A responsabilidade pela execução do transporte, horários, embarques, alterações, cancelamentos e reembolsos é exclusivamente da empresa organizadora do evento.';

export const CHECKOUT_RESPONSIBILITY_VALIDATION_MESSAGE =
  'Para continuar, confirme que leu as informações sobre a responsabilidade da empresa organizadora e o papel da Smartbus BR como plataforma intermediadora.';

export const getConfirmationResponsibilityText = (companyName: string) =>
  `Sua passagem foi emitida para um transporte operado por ${companyName}, empresa responsável pela execução do serviço, horários, embarques, alterações, cancelamentos e reembolsos. A Smartbus BR atua somente como plataforma intermediadora da venda.`;

export const getTicketTransportOperatedByText = (companyName: string) =>
  `Transporte operado por: ${companyName}`;

export const TICKET_PLATFORM_SALES_TEXT = 'Plataforma de venda: Smartbus BR';

export const TICKET_PLATFORM_LIABILITY_TEXT =
  'A Smartbus BR não é responsável pela execução do transporte, cancelamentos ou reembolsos, que são de responsabilidade da empresa organizadora.';

// Rodapé obrigatório para materiais emitidos/exportados no contexto da passagem.
export const TICKET_PDF_FOOTER_TEXT =
  'Gerado por — www.smartbusbr.com.br — Contato: (31) 99207-4309';
