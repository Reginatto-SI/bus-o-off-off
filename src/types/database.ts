export type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista' | 'developer';
export type RepresentativeStatus = 'ativo' | 'inativo' | 'bloqueado' | 'pendente_validacao';
export type RepresentativeCommissionStatus = 'pendente' | 'disponivel' | 'bloqueada' | 'paga';
export type EventStatus = 'rascunho' | 'a_venda' | 'encerrado';
export type EventCategory = 'evento' | 'excursao' | 'bate_e_volta' | 'viagem' | 'caravana';
export type VehicleType = 'onibus' | 'van' | 'micro_onibus';
export type TemplateVehicleType = VehicleType | 'double_deck';
export type VehicleStatus = 'ativo' | 'inativo';
export type DriverStatus = 'ativo' | 'inativo';
export type SaleStatus =
  | 'pendente'
  | 'pendente_taxa'
  | 'pendente_pagamento'
  | 'reservado'
  | 'pago'
  | 'cancelado'
  | 'bloqueado';
export type SellerStatus = 'ativo' | 'inativo';
export type ProfileStatus = 'ativo' | 'inativo';
export type TripType = 'ida' | 'volta';
export type SponsorStatus = 'ativo' | 'inativo';
export type SponsorLinkType = 'site' | 'whatsapp';
export type SocioSplitStatus = 'ativo' | 'inativo';

export type CommercialPartnerStatus = 'ativo' | 'inativo';
export type CommercialPartnerTier = 'basico' | 'destaque' | 'premium';

export type CompanyLegalType = 'PF' | 'PJ';


export type BenefitProgramStatus = 'ativo' | 'inativo';
export type BenefitType = 'percentual' | 'valor_fixo' | 'preco_final';

export interface BenefitProgram {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: BenefitProgramStatus;
  benefit_type: BenefitType;
  benefit_value: number;
  valid_from: string | null;
  valid_until: string | null;
  applies_to_all_events: boolean;
  created_at: string;
  updated_at: string;
}

export interface BenefitProgramEligibleCpf {
  id: string;
  company_id: string;
  benefit_program_id: string;
  cpf: string;
  full_name: string | null;
  status: BenefitProgramStatus;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BenefitProgramEventLink {
  id: string;
  company_id: string;
  benefit_program_id: string;
  event_id: string;
  created_at: string;
}

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
  referral_code: string;
  slogan: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  address_number: string | null;
  province: string | null;
  postal_code: string | null;
  notes: string | null;
  // Asaas: contrato oficial e único por ambiente.
  asaas_account_id_production?: string | null;
  asaas_account_email_production?: string | null;
  asaas_wallet_id_production?: string | null;
  asaas_api_key_production?: string | null;
  asaas_onboarding_complete_production?: boolean;
  asaas_pix_ready_production?: boolean;
  asaas_pix_last_checked_at_production?: string | null;
  asaas_pix_last_error_production?: string | null;
  asaas_account_id_sandbox?: string | null;
  asaas_account_email_sandbox?: string | null;
  asaas_wallet_id_sandbox?: string | null;
  asaas_api_key_sandbox?: string | null;
  asaas_onboarding_complete_sandbox?: boolean;
  asaas_pix_ready_sandbox?: boolean;
  asaas_pix_last_checked_at_sandbox?: string | null;
  asaas_pix_last_error_sandbox?: string | null;
  // Comissionamento variável
  platform_fee_percent: number;
  socio_split_percent: number;
  // Política de reservas administrativas por empresa (Fase 1)
  allow_manual_reservations: boolean;
  // Embarque manual sem leitura de QR Code na lista de passageiros do motorista.
  allow_manual_boarding: boolean;
  manual_reservation_ttl_minutes: number;
  // Vitrine pública (Fase 1)
  cover_image_url: string | null;
  use_default_cover: boolean;
  intro_text: string | null;
  background_style: 'solid' | 'subtle_gradient' | 'cover_overlay';
  hero_badge_labels: string[] | null;
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

export interface Representative {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  document_number: string | null;
  status: RepresentativeStatus;
  representative_code: string;
  referral_link: string | null;
  asaas_wallet_id_production: string | null;
  asaas_wallet_id_sandbox: string | null;
  commission_percent: number;
  created_at: string;
  updated_at: string;
}

export interface RepresentativeCompanyLink {
  id: string;
  company_id: string;
  representative_id: string;
  link_source: 'url_ref' | 'codigo_manual' | 'admin_ajuste';
  source_code: string;
  source_context: Record<string, unknown> | null;
  linked_at: string;
  locked: boolean;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, 'id' | 'name' | 'trade_name' | 'is_active'> | null;
}

export interface RepresentativeCommission {
  id: string;
  company_id: string;
  representative_id: string;
  sale_id: string;
  payment_environment: 'sandbox' | 'production';
  base_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: RepresentativeCommissionStatus;
  available_at: string | null;
  paid_at: string | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, 'id' | 'name' | 'trade_name'> | null;
  sale?: { id: string } | null;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  seller_id: string | null;
  driver_id: string | null;
  // Identificação operacional complementar para role técnica "motorista".
  operational_role: 'motorista' | 'auxiliar_embarque' | null;
  company_id: string;
}

export interface UserWithRole extends Profile {
  role?: UserRole;
  seller_id?: string | null;
  driver_id?: string | null;
  // Campo visual/cadastral; permissões continuam ancoradas em `role`.
  operational_role?: 'motorista' | 'auxiliar_embarque' | null;
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
  benefit_program_id: string | null;
  benefit_program_name: string | null;
  benefit_type: BenefitType | null;
  benefit_value: number | null;
  original_price: number;
  discount_amount: number;
  final_price: number;
  benefit_applied: boolean;
  pricing_rule_version: string;
  boarding_status: string;
  qr_code_token: string;
  ticket_number: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface SalePassengerRecord {
  id: string;
  sale_id: string;
  seat_id: string | null;
  seat_label: string;
  passenger_name: string;
  passenger_cpf: string;
  passenger_phone: string | null;
  trip_id: string;
  sort_order: number;
  company_id: string;
  benefit_program_id: string | null;
  benefit_program_name: string | null;
  benefit_type: BenefitType | null;
  benefit_value: number | null;
  original_price: number;
  discount_amount: number;
  final_price: number;
  benefit_applied: boolean;
  pricing_rule_version: string;
  created_at: string;
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
  whatsapp?: string | null;
  email?: string | null;
  cpf: string | null;
  rg?: string | null;
  birth_date?: string | null;
  cnh: string;
  cnh_category: string | null;
  cnh_expires_at: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  operational_role?: 'motorista' | 'auxiliar_embarque' | null;
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
  platform_fee_terms_version: string | null;
  platform_fee_terms_accepted_by: string | null;
  is_archived: boolean;
  image_url: string | null;
  // Categoria operacional do evento (uso principal em UX/filtros; não impõe regra de negócio).
  event_category: EventCategory | null;
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
  // Asaas
  asaas_payment_id: string | null;
  asaas_payment_status: string | null;
  asaas_transfer_id: string | null;
  sale_origin: string;
  payment_method: "pix" | "credit_card" | null;
  payment_confirmed_at: string | null;
  platform_fee_paid_at: string | null;
  // Lastro jurídico do checkout público: registra ciência sobre intermediação da plataforma.
  intermediation_responsibility_accepted: boolean;
  intermediation_responsibility_accepted_at: string | null;
  // Dados financeiros de comissão (preenchidos após pagamento)
  gross_amount: number | null;
  benefit_total_discount: number;
  platform_fee_total: number | null;
  socio_fee_amount: number | null;
  platform_net_amount: number | null;
  payment_environment: string;
  platform_fee_status: string;
  platform_fee_amount: number | null;
  platform_fee_payment_id: string | null;
  reservation_expires_at: string | null;
  block_reason: string | null;
  // QR próprio de venda/comprovante de serviços (separado do QR de passagem/ticket).
  service_qr_code_token: string | null;
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

export type SaleServiceItemStatus = 'ativo' | 'cancelado';

export interface SaleServiceItem {
  id: string;
  sale_id: string;
  company_id: string;
  event_id: string | null;
  service_id: string;
  event_service_id: string | null;
  service_name: string;
  unit_type: ServiceUnitType;
  control_type: ServiceControlType;
  quantity_total: number;
  quantity_used: number;
  quantity_remaining: number;
  unit_price: number;
  total_price: number;
  status: SaleServiceItemStatus;
  created_at: string;
  updated_at: string;
}

export type ServiceItemValidationResult = 'success' | 'blocked';

export interface ServiceItemValidation {
  id: string;
  company_id: string;
  sale_id: string;
  sale_service_item_id: string;
  service_id: string;
  validated_by_user_id: string | null;
  quantity_consumed: number;
  quantity_used_before: number | null;
  quantity_used_after: number | null;
  quantity_remaining_before: number | null;
  quantity_remaining_after: number | null;
  result: ServiceItemValidationResult;
  reason_code: string;
  detail: string | null;
  created_at: string;
}

export interface SocioSplit {
  id: string;
  /** Multi-tenant: sócio financeiro sempre pertence a uma empresa específica. */
  company_id: string;
  name: string;
  /** Identificador legado da carteira Asaas para split direto no pagamento. */
  asaas_wallet_id: string | null;
  /** Step 3: wallet explícita para produção. */
  asaas_wallet_id_production?: string | null;
  /** Step 3: wallet explícita para sandbox (uso futuro no Step 4). */
  asaas_wallet_id_sandbox?: string | null;
  commission_percent: number;
  status: SocioSplitStatus;
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

// =====================================================================
// Módulo de Passeios & Serviços (base inicial — sem venda nesta etapa)
// =====================================================================
export type ServiceUnitType = 'pessoa' | 'veiculo' | 'unitario';
export type ServiceControlType = 'validacao_obrigatoria' | 'sem_validacao';
export type ServiceStatus = 'ativo' | 'inativo';

export interface Service {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  unit_type: ServiceUnitType;
  control_type: ServiceControlType;
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
}

export interface EventService {
  id: string;
  event_id: string;
  service_id: string;
  company_id: string;
  base_price: number;
  total_capacity: number;
  // Reservado para evolução futura; nesta etapa é sempre 0.
  sold_quantity: number;
  allow_checkout: boolean;
  allow_standalone_sale: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  service?: Service;
}
