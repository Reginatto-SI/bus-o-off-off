-- Create enums
CREATE TYPE public.user_role AS ENUM ('gerente', 'operador', 'vendedor');
CREATE TYPE public.event_status AS ENUM ('rascunho', 'a_venda', 'encerrado');
CREATE TYPE public.vehicle_type AS ENUM ('onibus', 'van');
CREATE TYPE public.sale_status AS ENUM ('reservado', 'pago');
CREATE TYPE public.seller_status AS ENUM ('ativo', 'inativo');

-- Sellers table
CREATE TABLE public.sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    commission_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    status seller_status NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (for RBAC)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role user_role NOT NULL,
    seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
    UNIQUE (user_id, role)
);

-- Profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vehicles (Frota)
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type vehicle_type NOT NULL,
    plate TEXT NOT NULL UNIQUE,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Drivers (Motoristas)
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    cnh TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Boarding Locations (Locais de Embarque)
CREATE TABLE public.boarding_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    time TIME NOT NULL,
    maps_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Events
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    date DATE NOT NULL,
    city TEXT NOT NULL,
    description TEXT,
    status event_status NOT NULL DEFAULT 'rascunho',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trips (Viagens)
CREATE TABLE public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE RESTRICT NOT NULL,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE RESTRICT NOT NULL,
    departure_time TIME NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Event Boarding Locations (many-to-many)
CREATE TABLE public.event_boarding_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    boarding_location_id UUID REFERENCES public.boarding_locations(id) ON DELETE CASCADE NOT NULL,
    UNIQUE (event_id, boarding_location_id)
);

-- Sales
CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE RESTRICT NOT NULL,
    trip_id UUID REFERENCES public.trips(id) ON DELETE RESTRICT NOT NULL,
    boarding_location_id UUID REFERENCES public.boarding_locations(id) ON DELETE RESTRICT NOT NULL,
    seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_cpf TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status sale_status NOT NULL DEFAULT 'reservado',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_boarding_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's seller_id
CREATE OR REPLACE FUNCTION public.get_user_seller_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT seller_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Function to check if user is admin (gerente or operador)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('gerente', 'operador')
  )
$$;

-- RLS Policies

-- Profiles: users can read all profiles, update only their own
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles: only gerente can manage, users can see their own
CREATE POLICY "Admins can view all user_roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Gerente can manage user_roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

-- Sellers: admins can manage, vendedores can see their own
CREATE POLICY "Admins can view all sellers" ON public.sellers FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR id = public.get_user_seller_id(auth.uid()));
CREATE POLICY "Admins can manage sellers" ON public.sellers FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Vehicles, Drivers, Boarding Locations: admins can manage
CREATE POLICY "Admins can view vehicles" ON public.vehicles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage vehicles" ON public.vehicles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view drivers" ON public.drivers FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage drivers" ON public.drivers FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "All authenticated can view boarding_locations" ON public.boarding_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public can view boarding_locations" ON public.boarding_locations FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can manage boarding_locations" ON public.boarding_locations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Events: public can view available events, admins can manage all
CREATE POLICY "Public can view available events" ON public.events FOR SELECT TO anon USING (status = 'a_venda');
CREATE POLICY "All authenticated can view events" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage events" ON public.events FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Trips: public can view trips for available events
CREATE POLICY "Public can view trips" ON public.trips FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND status = 'a_venda'));
CREATE POLICY "All authenticated can view trips" ON public.trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage trips" ON public.trips FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Event Boarding Locations
CREATE POLICY "Public can view event_boarding_locations" ON public.event_boarding_locations FOR SELECT TO anon USING (true);
CREATE POLICY "All authenticated can view event_boarding_locations" ON public.event_boarding_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage event_boarding_locations" ON public.event_boarding_locations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Sales: public can insert, admins can see all, vendedores can see their own
CREATE POLICY "Public can create sales" ON public.sales FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated can create sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can view all sales" ON public.sales FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR seller_id = public.get_user_seller_id(auth.uid()));
CREATE POLICY "Admins can manage sales" ON public.sales FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sellers_updated_at BEFORE UPDATE ON public.sellers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_boarding_locations_updated_at BEFORE UPDATE ON public.boarding_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get available capacity for a trip
CREATE OR REPLACE FUNCTION public.get_trip_available_capacity(trip_uuid UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT t.capacity - COALESCE(SUM(s.quantity), 0)::INTEGER
  FROM public.trips t
  LEFT JOIN public.sales s ON s.trip_id = t.id
  WHERE t.id = trip_uuid
  GROUP BY t.id, t.capacity
$$;