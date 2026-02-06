export type UserRole = 'gerente' | 'operador' | 'vendedor';
export type EventStatus = 'rascunho' | 'a_venda' | 'encerrado';
export type VehicleType = 'onibus' | 'van';
export type VehicleStatus = 'ativo' | 'inativo';
export type DriverStatus = 'ativo' | 'inativo';
export type SaleStatus = 'reservado' | 'pago';
export type SellerStatus = 'ativo' | 'inativo';

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
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  seller_id: string | null;
  company_id: string;
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
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  event_id: string;
  vehicle_id: string;
  driver_id: string;
  departure_time: string;
  capacity: number;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
  driver?: Driver;
}

export interface EventBoardingLocation {
  id: string;
  event_id: string;
  boarding_location_id: string;
  boarding_location?: BoardingLocation;
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
  created_at: string;
  updated_at: string;
  event?: Event;
  trip?: Trip;
  boarding_location?: BoardingLocation;
  seller?: Seller;
}
