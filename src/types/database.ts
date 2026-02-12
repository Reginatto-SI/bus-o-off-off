export type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista';
export type EventStatus = 'rascunho' | 'a_venda' | 'encerrado';
// Adicionado Micro-ônibus como tipo suportado. Valor interno: micro_onibus
export type VehicleType = 'onibus' | 'van' | 'micro_onibus';
export type VehicleStatus = 'ativo' | 'inativo';
export type DriverStatus = 'ativo' | 'inativo';
export type SaleStatus = 'reservado' | 'pago' | 'cancelado';
export type SellerStatus = 'ativo' | 'inativo';
export type ProfileStatus = 'ativo' | 'inativo';
export type TripType = 'ida' | 'volta';
export type SponsorStatus = 'ativo' | 'inativo';
export type SponsorLinkType = 'site' | 'whatsapp';

export interface Company {
  id: string;
  name: string;
  // Identidade institucional
  trade_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  // Identidade visual
  logo_url: string | null;
  primary_color: string | null;
  // Contato institucional
  document: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
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

// Interface auxiliar para tela de usuários com dados completos
export interface UserWithRole extends Profile {
  role?: UserRole;
  seller_id?: string | null;
  driver_id?: string | null;
  seller?: Seller | null;
  driver?: Driver | null;
  user_role_id?: string;
}

export interface Seller {
  id: string;
  name: string;
  commission_percent: number;
  status: SellerStatus;
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
  // Configuração visual do corredor (ex.: 2x2, 2x1, 3x1)
  seats_left_side: number;
  seats_right_side: number;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export type SeatStatus = 'disponivel' | 'bloqueado';

export interface Seat {
  id: string;
  vehicle_id: string;
  label: string;
  floor: number;
  row_number: number;
  column_number: number;
  status: SeatStatus;
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
  company_id: string;
  created_at: string;
  updated_at: string;
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
  description: string | null;
  status: EventStatus;
  unit_price: number;
  max_tickets_per_purchase: number;
  allow_online_sale: boolean;
  allow_seller_sale: boolean;
  image_url: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
}

// Tipo para criação de viagens (atalho ida+volta)
export type TripCreationType = 'ida' | 'volta' | 'ida_volta';

export interface Trip {
  id: string;
  event_id: string;
  vehicle_id: string;
  driver_id: string;
  assistant_driver_id: string | null;
  paired_trip_id: string | null;        // Vínculo com viagem par (ida/volta)
  trip_type: TripType;
  departure_time: string | null;        // NULL = "A definir" (comum na volta)
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
  stop_order: number;                   // Ordem da parada na rota
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

// Tipo para eventos com dados da empresa (usado na vitrine pública)
export interface EventWithCompany extends Event {
  company?: {
    id: string;
    name: string;
    logo_url: string | null;
  };
}
