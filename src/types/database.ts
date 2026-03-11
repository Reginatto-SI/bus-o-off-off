export type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista' | 'developer';
export type EventStatus = 'rascunho' | 'a_venda' | 'encerrado';
export type VehicleType = 'onibus' | 'van' | 'micro_onibus';
export type TemplateVehicleType = VehicleType | 'double_deck';
export type VehicleStatus = 'ativo' | 'inativo';
export type DriverStatus = 'ativo' | 'inativo';
export type SaleStatus = 'pendente_pagamento' | 'reservado' | 'pago' | 'cancelado';
export type SellerStatus = 'ativo' | 'inativo';
export type ProfileStatus = 'ativo' | 'inativo';
export type TripType = 'ida' | 'volta';
export type SponsorStatus = 'ativo' | 'inativo';
export type SponsorLinkType = 'site' | 'whatsapp';
export type PartnerStatus = 'ativo' | 'inativo';

export type CommercialPartnerStatus = 'ativo' | 'inativo';
export type CommercialPartnerTier = 'basico' | 'destaque' | 'premium';

export type CompanyLegalType = 'PF' | 'PJ';

export interface Company {
  id: string;
  name: string;
  trade_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  legal_type: CompanyLegalType;
  document_number: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  ticket_color: string | null;
  public_slug: string | null;
  slogan: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  // Stripe Connect (legacy)
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  // Asaas
  asaas_account_id: string | null;
  asaas_account_email: string | null;
  asaas_wallet_id: string | null;
  asaas_api_key: string | null;
  asaas_onboarding_complete: boolean;
  // Comissionamento variável
  platform_fee_percent: number;
  partner_split_percent: number;
  // Vitrine pública (Fase 1)
  cover_image_url: string | null;
  use_default_cover: boolean;
  intro_text: string | null;
  background_style: 'solid' | 'subtle_gradient' | 'cover_overlay';
  // Redes sociais
  social_instagram: string | null;
  social_facebook: string | null;
  social_tiktok: string | null;
  social_youtube: string | null;
  social_telegram: string | null;
  social_twitter: string | null;
  social_website: string | null;
  // Sistema
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  cpf?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  status: ProfileStatus;
  notes: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  seller_id: string | null;
  driver_id: string | null;
  company_id: string;
}

export interface UserWithRole extends Profile {
  role?: UserRole;
  seller_id?: string | null;
  driver_id?: string | null;
  seller?: Seller | null;
  driver?: Driver | null;
  user_role_id?: string;
}

/**
 * Vendedor — cadastro 100% gerencial.
 * Não tem nenhuma relação com Stripe ou gateway de pagamento.
 * Comissão é apurada e paga manualmente pelo gerente (Pix ou outro meio próprio).
 * O campo seller_id em user_roles vincula um usuário do sistema a este cadastro para controle interno.
 */
export interface Seller {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  pix_key: string | null;
  notes: string | null;
  commission_percent: number;
  status: SellerStatus;
  /** Código curto alfanumérico (6 chars) para link curto /v/{short_code}. Estável e único por vendedor. */
  short_code: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  status: SponsorStatus;
  carousel_order: number;
  banner_url: string | null;
  link_type: SponsorLinkType;
  site_url: string | null;
  whatsapp_phone: string | null;
  whatsapp_message: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  // Multi-tenant: vincula patrocinador à empresa (obrigatório após migration Fase 1)
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  type: VehicleType;
  plate: string;
  owner: string | null;
  brand: string | null;
  model: string | null;
  year_model: number | null;
  capacity: number;
  chassis: string | null;
  renavam: string | null;
  color: string | null;
  whatsapp_group_link: string | null;
  notes: string | null;
  status: VehicleStatus;
  floors: number;
  seats_left_side: number;
  seats_right_side: number;
  template_layout_id: string | null;
  template_layout_version: number | null;
  layout_snapshot: Record<string, any> | null;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateLayout {
  id: string;
  name: string;
  vehicle_type: TemplateVehicleType;
  description: string | null;
  image_url: string | null;
  status: VehicleStatus;
  floors: number;
  grid_rows: number;
  grid_columns: number;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export type SeatStatus = 'disponivel' | 'bloqueado';
export type SeatCategory = 'convencional' | 'executivo' | 'leito' | 'semi_leito' | 'leito_cama';

export interface Seat {
  id: string;
  vehicle_id: string;
  label: string;
  floor: number;
  row_number: number;
  column_number: number;
  status: SeatStatus;
  category: SeatCategory;
  company_id: string;
  created_at: string;
}

export interface TicketRecord {
  id: string;
  sale_id: string;
  trip_id: string;
  seat_id: string | null;
  seat_label: string;
  passenger_name: string;
  passenger_cpf: string;
  passenger_phone: string | null;
  boarding_status: string;
  qr_code_token: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}



export type TicketValidationAction = 'checkin' | 'checkout';
export type TicketValidationResult = 'success' | 'blocked';

export interface TicketValidation {
  id: string;
  company_id: string;
  ticket_id: string | null;
  sale_id: string | null;
  event_id: string | null;
  trip_id: string | null;
  boarding_location_id: string | null;
  action: TicketValidationAction;
  result: TicketValidationResult;
  reason_code: string;
  validated_by_user_id: string | null;
  validated_by_driver_id: string | null;
  validated_at: string;
  device_info: string | null;
  app_version: string | null;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  cpf: string | null;
  cnh: string;
  cnh_category: string | null;
  cnh_expires_at: string | null;
  notes: string | null;
  status: DriverStatus;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export type BoardingLocationStatus = 'ativo' | 'inativo';

export interface BoardingLocation {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  maps_url: string | null;
  notes: string | null;
  status: BoardingLocationStatus;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  city: string;
  boarding_tolerance_minutes: number | null;
  description: string | null;
  public_info: string | null;
  status: EventStatus;
  unit_price: number;
  max_tickets_per_purchase: number;
  allow_online_sale: boolean;
  allow_seller_sale: boolean;
  enable_checkout_validation: boolean;
  pass_platform_fee_to_customer: boolean;
  platform_fee_terms_accepted: boolean;
  platform_fee_terms_accepted_at: string | null;
  is_archived: boolean;
  image_url: string | null;
  // Política comercial por evento: controla se vende trecho solto, ida obrigatória ou pacote fechado.
  transport_policy: TransportPolicy;
  // Preço diferenciado por categoria de assento
  use_category_pricing: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface EventCategoryPrice {
  id: string;
  event_id: string;
  company_id: string;
  category: SeatCategory;
  price: number;
  created_at: string;
  updated_at: string;
}

export type TransportPolicy = 'trecho_independente' | 'ida_obrigatoria_volta_opcional' | 'ida_volta_obrigatorio';

export type TripCreationType = 'ida' | 'volta' | 'ida_volta';

export interface Trip {
  id: string;
  event_id: string;
  vehicle_id: string;
  driver_id: string;
  assistant_driver_id: string | null;
  paired_trip_id: string | null;
  trip_type: TripType;
  departure_time: string | null;
  capacity: number;
  company_id: string;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
  driver?: Driver;
  assistant_driver?: Driver;
}

export interface EventBoardingLocation {
  id: string;
  event_id: string;
  boarding_location_id: string;
  trip_id: string | null;
  departure_time: string | null;
  departure_date: string | null;
  stop_order: number;
  company_id: string;
  boarding_location?: BoardingLocation;
  trip?: Trip;
}

export interface Sale {
  id: string;
  event_id: string;
  trip_id: string;
  boarding_location_id: string;
  seller_id: string | null;
  customer_name: string;
  customer_cpf: string;
  customer_phone: string;
  quantity: number;
  unit_price: number;
  status: SaleStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  // Stripe (legacy)
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  // Asaas
  asaas_payment_id: string | null;
  asaas_payment_status: string | null;
  asaas_transfer_id: string | null;
  // Dados financeiros de comissão (preenchidos após pagamento)
  gross_amount: number | null;
  platform_fee_total: number | null;
  partner_fee_amount: number | null;
  platform_net_amount: number | null;
  stripe_transfer_id: string | null;
  created_at: string;
  updated_at: string;
  event?: Event;
  trip?: Trip;
  boarding_location?: BoardingLocation;
  seller?: Seller;
}

export interface SaleLog {
  id: string;
  sale_id: string;
  action: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  performed_by: string | null;
  company_id: string;
  created_at: string;
}

export interface Partner {
  id: string;
  name: string;
  /** Identificador da carteira Asaas para split direto no pagamento. */
  asaas_wallet_id: string | null;
  // Campos legados do Stripe — mantidos para histórico, não usados no fluxo atual.
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  split_percent: number;
  status: PartnerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommercialPartner {
  id: string;
  company_id: string;
  name: string;
  status: CommercialPartnerStatus;
  display_order: number;
  partner_tier: CommercialPartnerTier;
  logo_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  whatsapp_phone: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  show_on_showcase: boolean;
  show_on_event_page: boolean;
  show_on_ticket: boolean;
  created_at: string;
  updated_at: string;
}

export type EventFeeType = 'fixed' | 'percent';

export interface EventFee {
  id: string;
  event_id: string;
  company_id: string;
  name: string;
  fee_type: EventFeeType;
  value: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventSponsor {
  id: string;
  event_id: string;
  sponsor_id: string;
  company_id: string;
  show_on_event_page: boolean;
  show_on_showcase: boolean;
  show_on_ticket: boolean;
  display_order: number;
  created_at: string;
  sponsor?: Sponsor;
}

export interface EventWithCompany extends Event {
  company?: {
    id: string;
    name: string;
    logo_url: string | null;
    whatsapp?: string | null;
  };
}
