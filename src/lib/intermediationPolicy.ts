// Centraliza os textos institucionais de intermediação para manter consistência jurídica
// entre evento, checkout, confirmação, ticket e futuras reutilizações (ex.: rodapé).
export const SMARTBUS_PLATFORM_SHORT_NOTICE =
  'A SmartBus atua como plataforma intermediadora de venda de passagens. A execução do transporte, cancelamentos e reembolsos são de responsabilidade da empresa organizadora do evento.';

export const getTransportResponsibilityIntro = (companyName: string) =>
  `Transporte realizado por: ${companyName}. SmartBus atua como plataforma tecnológica de venda, pagamento e controle de embarque.`;

export const TRANSPORT_RESPONSIBILITY_DETAILS =
  'Questões relacionadas à execução do transporte, horários, embarque, atrasos, cancelamentos, alterações e reembolsos são de responsabilidade da empresa organizadora.';

export const getCheckoutResponsibilityAcceptanceLabel = (companyName: string) =>
  `Declaro que estou comprando uma passagem operada por ${companyName} e que li as informações de responsabilidade da plataforma e da empresa organizadora.`;

export const CHECKOUT_RESPONSIBILITY_HELPER_TEXT =
  'A SmartBus atua exclusivamente como plataforma intermediadora da venda. A responsabilidade pela execução do transporte, horários, embarques, alterações, cancelamentos e reembolsos é exclusivamente da empresa organizadora do evento.';

export const CHECKOUT_RESPONSIBILITY_VALIDATION_MESSAGE =
  'Para continuar, confirme que leu as informações sobre a responsabilidade da empresa organizadora e o papel da SmartBus como plataforma intermediadora.';

export const getConfirmationResponsibilityText = (companyName: string) =>
  `Sua passagem foi emitida para um transporte operado por ${companyName}, empresa responsável pela execução do serviço, horários, embarques, alterações, cancelamentos e reembolsos. A SmartBus atua somente como plataforma intermediadora da venda.`;

export const getTicketTransportOperatedByText = (companyName: string) =>
  `Transporte operado por: ${companyName}`;

export const TICKET_PLATFORM_SALES_TEXT = 'Plataforma de venda: SmartBus';

export const TICKET_PLATFORM_LIABILITY_TEXT =
  'A SmartBus não é responsável pela execução do transporte, cancelamentos ou reembolsos, que são de responsabilidade da empresa organizadora.';

// Rodapé obrigatório para materiais emitidos/exportados no contexto da passagem.
export const TICKET_PDF_FOOTER_TEXT =
  'Gerado por — www.smartbusbr.com.br — Contato da plataforma: (31) 99207-4309';

export const REGULATORY_RESPONSIBILITY_TERMS_VERSION = '2026-07-responsabilidade-regulatoria-evento-v1';

export const REGULATORY_RESPONSIBILITY_ACCEPTANCE_TEXT =
  'Declaro que a empresa organizadora é responsável pela execução física do transporte, incluindo autorizações, licenças, seguros, veículos regulares, motoristas habilitados, cumprimento das normas aplicáveis e atendimento operacional aos passageiros. Declaro ciência de que a SmartBus atua como plataforma tecnológica de venda, pagamento e controle de embarque, sem executar diretamente o transporte nem validar juridicamente a operação.';
