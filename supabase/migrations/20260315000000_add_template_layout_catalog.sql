-- Catálogo global de templates oficiais de layout de veículos.
-- Comentário: recurso restrito ao role developer para evitar alteração operacional indevida.

CREATE TABLE IF NOT EXISTS public.template_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('onibus', 'double_deck', 'micro_onibus', 'van')),
  description text,
  status public.seller_status NOT NULL DEFAULT 'ativo',
  floors integer NOT NULL DEFAULT 1 CHECK (floors BETWEEN 1 AND 2),
  grid_rows integer NOT NULL DEFAULT 16 CHECK (grid_rows BETWEEN 4 AND 40),
  grid_columns integer NOT NULL DEFAULT 5 CHECK (grid_columns BETWEEN 3 AND 10),
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_layout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_layout_id uuid NOT NULL REFERENCES public.template_layouts(id) ON DELETE CASCADE,
  floor_number integer NOT NULL CHECK (floor_number IN (1, 2)),
  row_number integer NOT NULL CHECK (row_number > 0),
  column_number integer NOT NULL CHECK (column_number > 0),
  seat_number text,
  category text NOT NULL DEFAULT 'convencional' CHECK (category IN ('convencional', 'executivo', 'semi_leito', 'leito', 'leito_cama')),
  tags text[] NOT NULL DEFAULT '{}',
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_layout_id, floor_number, row_number, column_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_layout_items_unique_seat_number
  ON public.template_layout_items(template_layout_id, seat_number)
  WHERE seat_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.template_layout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_layout_id uuid NOT NULL REFERENCES public.template_layouts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  layout_snapshot jsonb NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_layout_id, version_number)
);

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS template_layout_id uuid REFERENCES public.template_layouts(id),
  ADD COLUMN IF NOT EXISTS template_layout_version integer,
  ADD COLUMN IF NOT EXISTS layout_snapshot jsonb;

COMMENT ON COLUMN public.vehicles.layout_snapshot IS 'Snapshot do template oficial aplicado ao veículo na criação';

ALTER TABLE public.template_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_layout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_layout_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer can manage template layouts" ON public.template_layouts;
CREATE POLICY "Developer can manage template layouts"
  ON public.template_layouts
  FOR ALL
  TO authenticated
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));

DROP POLICY IF EXISTS "Developer can manage template layout items" ON public.template_layout_items;
CREATE POLICY "Developer can manage template layout items"
  ON public.template_layout_items
  FOR ALL
  TO authenticated
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));

DROP POLICY IF EXISTS "Developer can manage template layout versions" ON public.template_layout_versions;
CREATE POLICY "Developer can manage template layout versions"
  ON public.template_layout_versions
  FOR ALL
  TO authenticated
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));


DROP POLICY IF EXISTS "Authenticated can view template layouts" ON public.template_layouts;
CREATE POLICY "Authenticated can view template layouts"
  ON public.template_layouts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can view template layout items" ON public.template_layout_items;
CREATE POLICY "Authenticated can view template layout items"
  ON public.template_layout_items
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can view template layout versions" ON public.template_layout_versions;
CREATE POLICY "Authenticated can view template layout versions"
  ON public.template_layout_versions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.bump_template_layout_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version integer;
  snapshot jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    UPDATE public.template_layouts
    SET updated_at = now()
    WHERE id = COALESCE(NEW.template_layout_id, OLD.template_layout_id);

    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO next_version
      FROM public.template_layout_versions
      WHERE template_layout_id = COALESCE(NEW.template_layout_id, OLD.template_layout_id);

    SELECT jsonb_build_object(
      'template_layout_id', l.id,
      'name', l.name,
      'vehicle_type', l.vehicle_type,
      'floors', l.floors,
      'grid_rows', l.grid_rows,
      'grid_columns', l.grid_columns,
      'items', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'floor_number', i.floor_number,
            'row_number', i.row_number,
            'column_number', i.column_number,
            'seat_number', i.seat_number,
            'category', i.category,
            'tags', i.tags,
            'is_blocked', i.is_blocked
          ) ORDER BY i.floor_number, i.row_number, i.column_number
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::jsonb
      )
    )
    INTO snapshot
    FROM public.template_layouts l
    LEFT JOIN public.template_layout_items i ON i.template_layout_id = l.id
    WHERE l.id = COALESCE(NEW.template_layout_id, OLD.template_layout_id)
    GROUP BY l.id;

    INSERT INTO public.template_layout_versions (template_layout_id, version_number, layout_snapshot, notes)
    VALUES (COALESCE(NEW.template_layout_id, OLD.template_layout_id), next_version, COALESCE(snapshot, '{}'::jsonb), 'Versionamento automático');

    UPDATE public.template_layouts
    SET current_version = next_version
    WHERE id = COALESCE(NEW.template_layout_id, OLD.template_layout_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_template_layout_items_bump_version ON public.template_layout_items;
CREATE TRIGGER trg_template_layout_items_bump_version
AFTER INSERT OR UPDATE OR DELETE ON public.template_layout_items
FOR EACH ROW EXECUTE FUNCTION public.bump_template_layout_version();

DROP TRIGGER IF EXISTS trg_update_template_layouts_updated_at ON public.template_layouts;
CREATE TRIGGER trg_update_template_layouts_updated_at
BEFORE UPDATE ON public.template_layouts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_update_template_layout_items_updated_at ON public.template_layout_items;
CREATE TRIGGER trg_update_template_layout_items_updated_at
BEFORE UPDATE ON public.template_layout_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seeds obrigatórios (globais de produto).
INSERT INTO public.template_layouts (name, vehicle_type, description, status, floors, grid_rows, grid_columns)
VALUES
  ('Double Deck 60 – Padrão Brasileiro', 'double_deck', 'Superior 48 assentos (2x2) e inferior 12 executivo, com áreas bloqueadas para escada/banheiro.', 'ativo', 2, 14, 5),
  ('Ônibus 46 – 2x2', 'onibus', 'Template oficial de ônibus 46 lugares em arranjo 2x2.', 'ativo', 1, 12, 5),
  ('Ônibus 52 – 2x2', 'onibus', 'Template oficial de ônibus 52 lugares em arranjo 2x2.', 'ativo', 1, 13, 5),
  ('Van 15 – 2x1', 'van', 'Template oficial de van 15 lugares em arranjo 2x1.', 'ativo', 1, 8, 4),
  ('Micro-ônibus 28 – 2x2', 'micro_onibus', 'Template oficial de micro-ônibus 28 lugares em arranjo 2x2.', 'ativo', 1, 8, 5)
ON CONFLICT DO NOTHING;

WITH dd AS (
  SELECT id FROM public.template_layouts WHERE name = 'Double Deck 60 – Padrão Brasileiro' LIMIT 1
),
rows_upper AS (
  SELECT generate_series(1, 12) AS r
),
seats_upper AS (
  SELECT 2 AS floor_number, r AS row_number, c AS column_number,
    ((r - 1) * 4 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 WHEN c = 4 THEN 3 ELSE 4 END)::text AS seat_number,
    CASE WHEN r <= 3 THEN 'leito' ELSE 'convencional' END AS category,
    CASE WHEN c IN (1,5) THEN ARRAY['janela'] ELSE ARRAY['corredor'] END AS tags
  FROM rows_upper, (VALUES (1),(2),(4),(5)) AS cols(c)
),
rows_lower AS (
  SELECT generate_series(1, 3) AS r
),
seats_lower AS (
  SELECT 1 AS floor_number, r AS row_number, c AS column_number,
    (48 + (r - 1) * 4 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 WHEN c = 4 THEN 3 ELSE 4 END)::text AS seat_number,
    'executivo' AS category,
    CASE WHEN c IN (1,5) THEN ARRAY['janela'] ELSE ARRAY['corredor'] END AS tags
  FROM rows_lower, (VALUES (1),(2),(4),(5)) AS cols(c)
)
INSERT INTO public.template_layout_items (template_layout_id, floor_number, row_number, column_number, seat_number, category, tags, is_blocked)
SELECT dd.id, s.floor_number, s.row_number, s.column_number, s.seat_number, s.category, s.tags, false
FROM dd CROSS JOIN (
  SELECT * FROM seats_upper
  UNION ALL
  SELECT * FROM seats_lower
) s
ON CONFLICT DO NOTHING;

WITH dd AS (
  SELECT id FROM public.template_layouts WHERE name = 'Double Deck 60 – Padrão Brasileiro' LIMIT 1
)
INSERT INTO public.template_layout_items (template_layout_id, floor_number, row_number, column_number, seat_number, category, tags, is_blocked)
SELECT dd.id, floor_number, row_number, column_number, NULL, 'convencional', ARRAY['bloqueado'], true
FROM dd CROSS JOIN (VALUES
  (1, 4, 3),
  (1, 5, 3),
  (1, 6, 3),
  (1, 6, 5)
) AS b(floor_number, row_number, column_number)
ON CONFLICT DO NOTHING;

WITH t AS (
  SELECT id FROM public.template_layouts WHERE name = 'Ônibus 46 – 2x2' LIMIT 1
),
rows_cte AS (SELECT generate_series(1, 12) AS r),
seats AS (
  SELECT 1 AS floor_number, r AS row_number, c AS column_number,
    ((r - 1) * 4 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 WHEN c = 4 THEN 3 ELSE 4 END)::text AS seat_number
  FROM rows_cte, (VALUES (1),(2),(4),(5)) AS cols(c)
  WHERE ((r - 1) * 4 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 WHEN c = 4 THEN 3 ELSE 4 END) <= 46
)
INSERT INTO public.template_layout_items (template_layout_id, floor_number, row_number, column_number, seat_number, category, tags)
SELECT t.id, floor_number, row_number, column_number, seat_number, 'convencional',
       CASE WHEN column_number IN (1,5) THEN ARRAY['janela'] ELSE ARRAY['corredor'] END
FROM t CROSS JOIN seats
ON CONFLICT DO NOTHING;

WITH t AS (
  SELECT id FROM public.template_layouts WHERE name = 'Ônibus 52 – 2x2' LIMIT 1
),
rows_cte AS (SELECT generate_series(1, 13) AS r),
seats AS (
  SELECT 1 AS floor_number, r AS row_number, c AS column_number,
    ((r - 1) * 4 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 WHEN c = 4 THEN 3 ELSE 4 END)::text AS seat_number
  FROM rows_cte, (VALUES (1),(2),(4),(5)) AS cols(c)
)
INSERT INTO public.template_layout_items (template_layout_id, floor_number, row_number, column_number, seat_number, category, tags)
SELECT t.id, floor_number, row_number, column_number, seat_number, 'convencional',
       CASE WHEN column_number IN (1,5) THEN ARRAY['janela'] ELSE ARRAY['corredor'] END
FROM t CROSS JOIN seats
ON CONFLICT DO NOTHING;

WITH t AS (
  SELECT id FROM public.template_layouts WHERE name = 'Van 15 – 2x1' LIMIT 1
),
rows_cte AS (SELECT generate_series(1, 8) AS r),
seats AS (
  SELECT 1 AS floor_number, r AS row_number, c AS column_number,
    ((r - 1) * 3 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 ELSE 3 END)::text AS seat_number
  FROM rows_cte, (VALUES (1),(2),(4)) AS cols(c)
  WHERE ((r - 1) * 3 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 ELSE 3 END) <= 15
)
INSERT INTO public.template_layout_items (template_layout_id, floor_number, row_number, column_number, seat_number, category, tags)
SELECT t.id, floor_number, row_number, column_number, seat_number, 'convencional',
       CASE WHEN column_number IN (1,4) THEN ARRAY['janela'] ELSE ARRAY['corredor'] END
FROM t CROSS JOIN seats
ON CONFLICT DO NOTHING;

WITH t AS (
  SELECT id FROM public.template_layouts WHERE name = 'Micro-ônibus 28 – 2x2' LIMIT 1
),
rows_cte AS (SELECT generate_series(1, 8) AS r),
seats AS (
  SELECT 1 AS floor_number, r AS row_number, c AS column_number,
    ((r - 1) * 4 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 WHEN c = 4 THEN 3 ELSE 4 END)::text AS seat_number
  FROM rows_cte, (VALUES (1),(2),(4),(5)) AS cols(c)
  WHERE ((r - 1) * 4 + CASE WHEN c = 1 THEN 1 WHEN c = 2 THEN 2 WHEN c = 4 THEN 3 ELSE 4 END) <= 28
)
INSERT INTO public.template_layout_items (template_layout_id, floor_number, row_number, column_number, seat_number, category, tags)
SELECT t.id, floor_number, row_number, column_number, seat_number, 'convencional',
       CASE WHEN column_number IN (1,5) THEN ARRAY['janela'] ELSE ARRAY['corredor'] END
FROM t CROSS JOIN seats
ON CONFLICT DO NOTHING;
