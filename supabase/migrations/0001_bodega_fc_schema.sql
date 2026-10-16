-- =============================================================================
-- Migración Inicial: 0001_bodega_fc_schema.sql
-- Modelo de datos, reglas de inmutabilidad, RLS y funciones RPC para Bodega FC
-- =============================================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABLAS DEL MODELO DE DATOS (Sección 6)
-- =============================================================================

-- 1.1 Configuración (singleton_key = true para garantizar registro único)
CREATE TABLE IF NOT EXISTS public.workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key boolean NOT NULL DEFAULT true CHECK (singleton_key = true),
  active_upload_id uuid, -- Referencia agregada como FK tras crear pdf_uploads
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_settings_singleton UNIQUE (singleton_key)
);

-- 1.2 Cargas de PDF
CREATE TABLE IF NOT EXISTS public.pdf_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  price_list_date date,
  bcv_rate numeric(12, 2),
  product_count integer NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'not_applied', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pdf_uploads_status_data CHECK (
    (status IN ('pending', 'failed')) OR
    (price_list_date IS NOT NULL AND bcv_rate IS NOT NULL AND bcv_rate > 0)
  )
);

-- Foreign key diferida para active_upload_id en workspace_settings
ALTER TABLE public.workspace_settings
  DROP CONSTRAINT IF EXISTS fk_workspace_settings_active_upload;

ALTER TABLE public.workspace_settings
  ADD CONSTRAINT fk_workspace_settings_active_upload
  FOREIGN KEY (active_upload_id) REFERENCES public.pdf_uploads(id) ON DELETE SET NULL;

-- Índice único parcial: Solo una carga puede tener status = 'applied' a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_applied_upload
  ON public.pdf_uploads ((status))
  WHERE status = 'applied';

-- Índice para orden cronológico inverso rápido de cargas
CREATE INDEX IF NOT EXISTS idx_pdf_uploads_created_at_desc
  ON public.pdf_uploads (created_at DESC);

-- 1.3 Productos (Catálogo normalizado)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  first_seen_upload_id uuid NOT NULL REFERENCES public.pdf_uploads(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.4 Precios de productos (Inmutable: histórico de precios por carga)
CREATE TABLE IF NOT EXISTS public.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL REFERENCES public.pdf_uploads(id) ON DELETE RESTRICT,
  box_price_bs numeric(12, 2) NOT NULL CHECK (box_price_bs > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_prices_product_upload UNIQUE (product_id, upload_id)
);

CREATE INDEX IF NOT EXISTS idx_product_prices_product_id
  ON public.product_prices (product_id);

CREATE INDEX IF NOT EXISTS idx_product_prices_upload_id
  ON public.product_prices (upload_id);

-- 1.5 Vínculos producto–carga (Inmutable: presencia en carga)
CREATE TABLE IF NOT EXISTS public.product_upload_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL REFERENCES public.pdf_uploads(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_upload_links_product_upload UNIQUE (product_id, upload_id)
);

CREATE INDEX IF NOT EXISTS idx_product_upload_links_upload_id
  ON public.product_upload_links (upload_id);

-- 1.6 Productos de la tienda (Mi tienda)
CREATE TABLE IF NOT EXISTS public.store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE RESTRICT,
  custom_name text NOT NULL CHECK (char_length(custom_name) >= 1 AND char_length(custom_name) <= 200),
  manual_price_bs numeric(12, 2) CHECK (manual_price_bs IS NULL OR manual_price_bs > 0),
  units_per_box integer NOT NULL DEFAULT 1 CHECK (units_per_box >= 1 AND units_per_box <= 9999),
  margins jsonb NOT NULL DEFAULT '[0]'::jsonb CHECK (
    jsonb_typeof(margins) = 'array' AND
    jsonb_array_length(margins) >= 1 AND
    jsonb_array_length(margins) <= 5
  ),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_products_position
  ON public.store_products (position ASC, created_at ASC);

-- 1.7 Listas de compras
CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finalized')),
  finalized_at timestamptz,
  captured_bcv_rate numeric(12, 2) CHECK (captured_bcv_rate IS NULL OR captured_bcv_rate > 0),
  captured_price_list_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_shopping_lists_status_consistency CHECK (
    (status = 'open' AND finalized_at IS NULL AND captured_bcv_rate IS NULL AND captured_price_list_date IS NULL) OR
    (status = 'finalized' AND finalized_at IS NOT NULL AND captured_bcv_rate IS NOT NULL AND captured_price_list_date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_created_at_desc
  ON public.shopping_lists (created_at DESC);

-- 1.8 Productos de una lista de compras
CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  captured_product_name text,
  captured_box_price_bs numeric(12, 2) CHECK (captured_box_price_bs IS NULL OR captured_box_price_bs > 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 9999),
  currency_tag text NOT NULL DEFAULT 'VES' CHECK (currency_tag IN ('VES', 'USD')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_shopping_list_items_list_product UNIQUE (list_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_position
  ON public.shopping_list_items (list_id, position ASC, created_at ASC);

-- 1.9 Facturas de compra (Inmutable: generada al finalizar lista)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL UNIQUE REFERENCES public.shopping_lists(id) ON DELETE RESTRICT,
  list_name text NOT NULL,
  price_list_date date NOT NULL,
  bcv_rate numeric(12, 2) NOT NULL CHECK (bcv_rate > 0),
  total_bs numeric(12, 2) NOT NULL CHECK (total_bs >= 0),
  has_usd_lines boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.10 Líneas de factura (Inmutable: desglose de factura)
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 1 AND quantity <= 9999),
  box_price_bs numeric(12, 2) NOT NULL CHECK (box_price_bs > 0),
  currency_tag text NOT NULL CHECK (currency_tag IN ('VES', 'USD')),
  line_total_bs numeric(12, 2) NOT NULL CHECK (line_total_bs >= 0),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_product
  ON public.invoice_lines (invoice_id, product_name ASC);

-- =============================================================================
-- 2. TRIGGERS DE MANTENIMIENTO AUTOMÁTICO DE updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspace_settings_updated_at ON public.workspace_settings;
CREATE TRIGGER trg_workspace_settings_updated_at
  BEFORE UPDATE ON public.workspace_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pdf_uploads_updated_at ON public.pdf_uploads;
CREATE TRIGGER trg_pdf_uploads_updated_at
  BEFORE UPDATE ON public.pdf_uploads
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_store_products_updated_at ON public.store_products;
CREATE TRIGGER trg_store_products_updated_at
  BEFORE UPDATE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_shopping_lists_updated_at ON public.shopping_lists;
CREATE TRIGGER trg_shopping_lists_updated_at
  BEFORE UPDATE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_shopping_list_items_updated_at ON public.shopping_list_items;
CREATE TRIGGER trg_shopping_list_items_updated_at
  BEFORE UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

-- =============================================================================
-- 3. TRIGGERS DE INMUTABILIDAD (Sección 7: Matriz de permisos)
-- =============================================================================

-- 3.1 Bloqueo genérico de eliminación en tablas donde Nadie puede eliminar
CREATE OR REPLACE FUNCTION public.trg_prevent_delete_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Eliminación prohibida en tabla inmutable: %', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- 3.2 Bloqueo genérico de modificación en tablas donde Nadie puede modificar
CREATE OR REPLACE FUNCTION public.trg_prevent_update_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Modificación prohibida en tabla inmutable: %', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- Aplicar bloqueo DELETE
DROP TRIGGER IF EXISTS trg_prevent_delete_workspace_settings ON public.workspace_settings;
CREATE TRIGGER trg_prevent_delete_workspace_settings
  BEFORE DELETE ON public.workspace_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_immutable();

DROP TRIGGER IF EXISTS trg_prevent_delete_pdf_uploads ON public.pdf_uploads;
CREATE TRIGGER trg_prevent_delete_pdf_uploads
  BEFORE DELETE ON public.pdf_uploads
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_immutable();

DROP TRIGGER IF EXISTS trg_prevent_delete_products ON public.products;
CREATE TRIGGER trg_prevent_delete_products
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_immutable();

DROP TRIGGER IF EXISTS trg_prevent_delete_product_prices ON public.product_prices;
CREATE TRIGGER trg_prevent_delete_product_prices
  BEFORE DELETE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_immutable();

DROP TRIGGER IF EXISTS trg_prevent_delete_product_upload_links ON public.product_upload_links;
CREATE TRIGGER trg_prevent_delete_product_upload_links
  BEFORE DELETE ON public.product_upload_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_immutable();

DROP TRIGGER IF EXISTS trg_prevent_delete_invoices ON public.invoices;
CREATE TRIGGER trg_prevent_delete_invoices
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_immutable();

DROP TRIGGER IF EXISTS trg_prevent_delete_invoice_lines ON public.invoice_lines;
CREATE TRIGGER trg_prevent_delete_invoice_lines
  BEFORE DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_delete_immutable();

-- Aplicar bloqueo UPDATE
DROP TRIGGER IF EXISTS trg_prevent_update_product_prices ON public.product_prices;
CREATE TRIGGER trg_prevent_update_product_prices
  BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_update_immutable();

DROP TRIGGER IF EXISTS trg_prevent_update_product_upload_links ON public.product_upload_links;
CREATE TRIGGER trg_prevent_update_product_upload_links
  BEFORE UPDATE ON public.product_upload_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_update_immutable();

DROP TRIGGER IF EXISTS trg_prevent_update_invoices ON public.invoices;
CREATE TRIGGER trg_prevent_update_invoices
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_update_immutable();

DROP TRIGGER IF EXISTS trg_prevent_update_invoice_lines ON public.invoice_lines;
CREATE TRIGGER trg_prevent_update_invoice_lines
  BEFORE UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_update_immutable();

-- 3.3 Bloqueo de modificación y eliminación en shopping_lists cuando ya está finalizada
CREATE OR REPLACE FUNCTION public.trg_protect_finalized_shopping_list()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'Esta lista ya fue finalizada y no puede editarse ni eliminarse.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_finalized_shopping_list ON public.shopping_lists;
CREATE TRIGGER trg_protect_finalized_shopping_list
  BEFORE UPDATE OR DELETE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.trg_protect_finalized_shopping_list();

-- 3.4 Bloqueo de inserción, modificación o eliminación en shopping_list_items si la lista padre está finalizada
CREATE OR REPLACE FUNCTION public.trg_protect_finalized_shopping_list_items()
RETURNS trigger AS $$
DECLARE
  v_list_id uuid;
  v_list_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_list_id := OLD.list_id;
  ELSE
    v_list_id := NEW.list_id;
  END IF;

  SELECT status INTO v_list_status
  FROM public.shopping_lists
  WHERE id = v_list_id;

  IF v_list_status = 'finalized' THEN
    RAISE EXCEPTION 'Esta lista ya fue finalizada y no puede editarse.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_finalized_shopping_list_items ON public.shopping_list_items;
CREATE TRIGGER trg_protect_finalized_shopping_list_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_protect_finalized_shopping_list_items();

-- =============================================================================
-- 4. ROW LEVEL SECURITY (RLS) Y BLOQUEO ANÓNIMO (Sección 7)
-- =============================================================================

ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_upload_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- Revocación total de permisos a roles anónimo y autenticado
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- =============================================================================
-- 5. FUNCIONES TRANSACCIONALES RPC (CONT-04)
-- =============================================================================

-- 5.1 ensure_workspace_settings: Garantiza existencia del singleton y devuelve active_upload_id
CREATE OR REPLACE FUNCTION public.ensure_workspace_settings()
RETURNS uuid AS $$
DECLARE
  v_active_id uuid;
BEGIN
  INSERT INTO public.workspace_settings (singleton_key)
  VALUES (true)
  ON CONFLICT (singleton_key) DO NOTHING;

  SELECT active_upload_id INTO v_active_id
  FROM public.workspace_settings
  WHERE singleton_key = true;

  RETURN v_active_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.2 expire_stale_pending_uploads: Marca como fallida toda carga pendiente con más de 10 min
CREATE OR REPLACE FUNCTION public.expire_stale_pending_uploads()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.pdf_uploads
    SET status = 'failed',
        updated_at = now()
    WHERE status = 'pending'
      AND created_at < (now() - interval '10 minutes')
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.3 apply_pdf_upload: Aplica carga de PDF atómica y serializada
CREATE OR REPLACE FUNCTION public.apply_pdf_upload(
  p_upload_id uuid,
  p_price_list_date date,
  p_bcv_rate numeric,
  p_products jsonb
) RETURNS jsonb AS $$
DECLARE
  v_current_status text;
  v_previous_applied_id uuid;
  v_read_count integer := 0;
  v_new_count integer := 0;
  v_priceless_store_count integer := 0;
  v_elem jsonb;
  v_source_name text;
  v_display_name text;
  v_box_price numeric;
  v_product_id uuid;
BEGIN
  -- Serializar cargas concurrentes (Sección 8: L312)
  PERFORM pg_advisory_xact_lock(1001);

  -- Asegurar existencia del singleton de configuración
  PERFORM public.ensure_workspace_settings();

  -- Verificar existencia y estado de la carga
  SELECT status INTO v_current_status
  FROM public.pdf_uploads
  WHERE id = p_upload_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carga de PDF no encontrada: %', p_upload_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'La carga de PDF no está pendiente (estado actual: %)', v_current_status
      USING ERRCODE = 'P0003';
  END IF;

  -- Procesar productos leídos
  IF jsonb_typeof(p_products) = 'array' THEN
    v_read_count := jsonb_array_length(p_products);

    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_products)
    LOOP
      v_source_name := v_elem->>'sourceName';
      v_display_name := v_elem->>'displayName';
      v_box_price := (v_elem->>'boxPriceBs')::numeric;

      IF v_source_name IS NULL OR v_display_name IS NULL OR v_box_price IS NULL OR v_box_price <= 0 THEN
        RAISE EXCEPTION 'Producto inválido en carga: %', v_elem
          USING ERRCODE = 'P0004';
      END IF;

      -- Obtener o crear producto
      SELECT id INTO v_product_id
      FROM public.products
      WHERE source_name = v_source_name;

      IF v_product_id IS NULL THEN
        INSERT INTO public.products (source_name, display_name, first_seen_upload_id)
        VALUES (v_source_name, v_display_name, p_upload_id)
        RETURNING id INTO v_product_id;
        v_new_count := v_new_count + 1;
      END IF;

      -- Registrar precio inmutable
      INSERT INTO public.product_prices (product_id, upload_id, box_price_bs)
      VALUES (v_product_id, p_upload_id, v_box_price)
      ON CONFLICT (product_id, upload_id) DO NOTHING;

      -- Registrar vínculo con esta carga
      INSERT INTO public.product_upload_links (product_id, upload_id)
      VALUES (v_product_id, p_upload_id)
      ON CONFLICT (product_id, upload_id) DO NOTHING;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'p_products debe ser un arreglo JSON'
      USING ERRCODE = 'P0005';
  END IF;

  -- Identificar carga activa previa
  SELECT active_upload_id INTO v_previous_applied_id
  FROM public.workspace_settings
  WHERE singleton_key = true;

  -- Pasar carga activa previa a 'not_applied'
  IF v_previous_applied_id IS NOT NULL AND v_previous_applied_id != p_upload_id THEN
    UPDATE public.pdf_uploads
    SET status = 'not_applied',
        updated_at = now()
    WHERE id = v_previous_applied_id AND status = 'applied';
  END IF;

  -- Marcar carga como 'applied'
  UPDATE public.pdf_uploads
  SET status = 'applied',
      price_list_date = p_price_list_date,
      bcv_rate = p_bcv_rate,
      product_count = v_read_count,
      updated_at = now()
  WHERE id = p_upload_id;

  -- Actualizar carga activa en la configuración
  UPDATE public.workspace_settings
  SET active_upload_id = p_upload_id,
      updated_at = now()
  WHERE singleton_key = true;

  -- Calcular cuántos productos en Mi tienda quedan "Sin precio"
  SELECT count(*) INTO v_priceless_store_count
  FROM public.store_products sp
  WHERE sp.manual_price_bs IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.product_prices pp
      WHERE pp.product_id = sp.product_id
        AND pp.upload_id = p_upload_id
    );

  RETURN jsonb_build_object(
    'read_count', v_read_count,
    'new_count', v_new_count,
    'priceless_store_count', v_priceless_store_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.4 reorder_store_products: Reordenamiento todo-o-nada de Mi tienda
CREATE OR REPLACE FUNCTION public.reorder_store_products(p_ordered_ids uuid[])
RETURNS void AS $$
DECLARE
  v_total_count integer;
  v_unique_count integer;
  v_match_count integer;
BEGIN
  -- 1. Rechazar lista vacía
  IF p_ordered_ids IS NULL OR cardinality(p_ordered_ids) = 0 THEN
    RAISE EXCEPTION 'La lista de identificadores no puede estar vacía.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_total_count FROM public.store_products;

  -- 2. Cantidad igual al total de la tienda
  IF cardinality(p_ordered_ids) != v_total_count THEN
    RAISE EXCEPTION 'La cantidad de identificadores (%) no coincide con el total de la tienda (%).',
      cardinality(p_ordered_ids), v_total_count
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Sin duplicados
  SELECT count(DISTINCT id) INTO v_unique_count
  FROM unnest(p_ordered_ids) AS id;

  IF v_unique_count != v_total_count THEN
    RAISE EXCEPTION 'La lista contiene identificadores duplicados.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Todos los IDs pertenecen a la tienda
  SELECT count(*) INTO v_match_count
  FROM public.store_products
  WHERE id = ANY(p_ordered_ids);

  IF v_match_count != v_total_count THEN
    RAISE EXCEPTION 'Uno o más identificadores no pertenecen a la tienda.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Asignar posiciones consecutivas desde 0
  UPDATE public.store_products sp
  SET position = ord.pos - 1,
      updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS ord(id, pos)
  WHERE sp.id = ord.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.5 reorder_shopping_list_items: Reordenamiento todo-o-nada de lista de compras
CREATE OR REPLACE FUNCTION public.reorder_shopping_list_items(
  p_list_id uuid,
  p_ordered_ids uuid[]
) RETURNS void AS $$
DECLARE
  v_list_status text;
  v_total_count integer;
  v_unique_count integer;
  v_match_count integer;
BEGIN
  -- Bloquear lista
  SELECT status INTO v_list_status
  FROM public.shopping_lists
  WHERE id = p_list_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta lista ya no existe.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_list_status = 'finalized' THEN
    RAISE EXCEPTION 'Esta lista ya fue finalizada y no puede editarse.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Rechazar lista vacía
  IF p_ordered_ids IS NULL OR cardinality(p_ordered_ids) = 0 THEN
    RAISE EXCEPTION 'La lista de identificadores no puede estar vacía.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_total_count
  FROM public.shopping_list_items
  WHERE list_id = p_list_id;

  IF cardinality(p_ordered_ids) != v_total_count THEN
    RAISE EXCEPTION 'La cantidad de identificadores (%) no coincide con el total de ítems (%).',
      cardinality(p_ordered_ids), v_total_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(DISTINCT id) INTO v_unique_count
  FROM unnest(p_ordered_ids) AS id;

  IF v_unique_count != v_total_count THEN
    RAISE EXCEPTION 'La lista contiene identificadores duplicados.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_match_count
  FROM public.shopping_list_items
  WHERE list_id = p_list_id AND id = ANY(p_ordered_ids);

  IF v_match_count != v_total_count THEN
    RAISE EXCEPTION 'Uno o más identificadores no pertenecen a esta lista.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.shopping_list_items sli
  SET position = ord.pos - 1,
      updated_at = now()
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS ord(id, pos)
  WHERE sli.id = ord.id AND sli.list_id = p_list_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.6 finalize_shopping_list: Finalización atómica, inmutable e idempotente de lista y factura
CREATE OR REPLACE FUNCTION public.finalize_shopping_list(p_list_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_list record;
  v_active_upload_id uuid;
  v_active_price_list_date date;
  v_active_bcv_rate numeric;
  v_item_count integer;
  v_priceless_count integer;
  v_invoice_id uuid;
  v_total_bs numeric := 0;
  v_has_usd_lines boolean := false;
  v_existing_invoice jsonb;
  v_item record;
  v_resolved_name text;
  v_resolved_price numeric;
BEGIN
  -- 1. Bloquear la lista para edición concurrente
  SELECT * INTO v_list
  FROM public.shopping_lists
  WHERE id = p_list_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta lista ya no existe.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Idempotencia: Si ya está finalizada, retornar la factura existente sin error
  IF v_list.status = 'finalized' THEN
    SELECT jsonb_build_object(
      'id', inv.id,
      'listId', inv.list_id,
      'listName', inv.list_name,
      'finalizedAt', to_char(v_list.finalized_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'priceListDate', to_char(inv.price_list_date, 'YYYY-MM-DD'),
      'bcvRate', inv.bcv_rate,
      'totalBs', inv.total_bs,
      'hasUsdLines', inv.has_usd_lines,
      'lines', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', il.id,
            'productName', il.product_name,
            'quantity', il.quantity,
            'boxPriceBs', il.box_price_bs,
            'currencyTag', il.currency_tag,
            'lineTotalBs', il.line_total_bs,
            'position', il.position
          ) ORDER BY il.product_name ASC
        )
        FROM public.invoice_lines il
        WHERE il.invoice_id = inv.id
      ), '[]'::jsonb)
    ) INTO v_existing_invoice
    FROM public.invoices inv
    WHERE inv.list_id = p_list_id;

    IF v_existing_invoice IS NOT NULL THEN
      RETURN v_existing_invoice;
    ELSE
      RAISE EXCEPTION 'Lista finalizada sin factura correspondiente'
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  -- 3. Bloquear todos los ítems de la lista
  PERFORM 1
  FROM public.shopping_list_items
  WHERE list_id = p_list_id
  FOR UPDATE;

  -- 4. Verificación A: Lista no vacía (al menos 1 producto)
  SELECT count(*) INTO v_item_count
  FROM public.shopping_list_items
  WHERE list_id = p_list_id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'La lista está vacía. Agrega productos para poder finalizarla.'
      USING ERRCODE = 'P0010';
  END IF;

  -- 5. Verificación B: Carga activa existente en workspace_settings
  SELECT active_upload_id INTO v_active_upload_id
  FROM public.workspace_settings
  WHERE singleton_key = true;

  IF v_active_upload_id IS NULL THEN
    RAISE EXCEPTION 'Carga un PDF de precios para poder finalizar la lista.'
      USING ERRCODE = 'P0011';
  END IF;

  SELECT price_list_date, bcv_rate
  INTO v_active_price_list_date, v_active_bcv_rate
  FROM public.pdf_uploads
  WHERE id = v_active_upload_id AND status = 'applied';

  IF v_active_price_list_date IS NULL OR v_active_bcv_rate IS NULL THEN
    RAISE EXCEPTION 'Carga un PDF de precios para poder finalizar la lista.'
      USING ERRCODE = 'P0011';
  END IF;

  -- 6. Verificación C y copia de precios en shopping_list_items (ORDEN CRÍTICO: antes de finalizar la lista)
  FOR v_item IN
    SELECT
      sli.id AS item_id,
      sli.quantity,
      sli.currency_tag,
      sli.position,
      p.display_name AS catalog_display_name,
      sp.custom_name AS store_custom_name,
      sp.manual_price_bs AS store_manual_price_bs,
      pp.box_price_bs AS catalog_box_price_bs
    FROM public.shopping_list_items sli
    JOIN public.products p ON p.id = sli.product_id
    LEFT JOIN public.store_products sp ON sp.product_id = sli.product_id
    LEFT JOIN public.product_prices pp ON pp.product_id = sli.product_id AND pp.upload_id = v_active_upload_id
    WHERE sli.list_id = p_list_id
    ORDER BY sli.position ASC
  LOOP
    -- Resolver nombre según Sección 11 (L449-L450)
    IF v_item.store_custom_name IS NOT NULL AND trim(v_item.store_custom_name) != '' THEN
      v_resolved_name := trim(v_item.store_custom_name);
    ELSE
      v_resolved_name := v_item.catalog_display_name;
    END IF;

    -- Resolver precio según Sección 11 (L449-L451)
    IF v_item.store_manual_price_bs IS NOT NULL THEN
      v_resolved_price := v_item.store_manual_price_bs;
    ELSE
      v_resolved_price := v_item.catalog_box_price_bs;
    END IF;

    -- Si algún producto queda "Sin precio", abortar inmediatamente
    IF v_resolved_price IS NULL THEN
      RAISE EXCEPTION 'Hay productos sin precio. Agrégales un precio manual en Mi tienda para poder finalizar.'
        USING ERRCODE = 'P0012';
    END IF;

    -- Actualizar ítem mientras la lista padre sigue 'open'
    UPDATE public.shopping_list_items
    SET captured_product_name = v_resolved_name,
        captured_box_price_bs = v_resolved_price,
        updated_at = now()
    WHERE id = v_item.item_id;

    -- Acumular totales de factura
    IF v_item.currency_tag = 'VES' THEN
      v_total_bs := v_total_bs + round(v_item.quantity * v_resolved_price, 2);
    ELSIF v_item.currency_tag = 'USD' THEN
      v_has_usd_lines := true;
    END IF;
  END LOOP;

  -- 7. Actualizar shopping_lists pasando a 'finalized'
  UPDATE public.shopping_lists
  SET status = 'finalized',
      finalized_at = now(),
      captured_bcv_rate = v_active_bcv_rate,
      captured_price_list_date = v_active_price_list_date,
      updated_at = now()
  WHERE id = p_list_id;

  -- 8. Insertar factura permanente
  INSERT INTO public.invoices (
    list_id,
    list_name,
    price_list_date,
    bcv_rate,
    total_bs,
    has_usd_lines
  ) VALUES (
    p_list_id,
    v_list.name,
    v_active_price_list_date,
    v_active_bcv_rate,
    round(v_total_bs, 2),
    v_has_usd_lines
  ) RETURNING id INTO v_invoice_id;

  -- 9. Insertar líneas de factura permanentes
  INSERT INTO public.invoice_lines (
    invoice_id,
    product_name,
    quantity,
    box_price_bs,
    currency_tag,
    line_total_bs,
    position
  )
  SELECT
    v_invoice_id,
    sli.captured_product_name,
    sli.quantity,
    sli.captured_box_price_bs,
    sli.currency_tag,
    round(sli.quantity * sli.captured_box_price_bs, 2),
    sli.position
  FROM public.shopping_list_items sli
  WHERE sli.list_id = p_list_id;

  -- 10. Retornar la factura generada con líneas en orden alfabético
  RETURN jsonb_build_object(
    'id', v_invoice_id,
    'listId', p_list_id,
    'listName', v_list.name,
    'finalizedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'priceListDate', to_char(v_active_price_list_date, 'YYYY-MM-DD'),
    'bcvRate', v_active_bcv_rate,
    'totalBs', round(v_total_bs, 2),
    'hasUsdLines', v_has_usd_lines,
    'lines', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', il.id,
          'productName', il.product_name,
          'quantity', il.quantity,
          'boxPriceBs', il.box_price_bs,
          'currencyTag', il.currency_tag,
          'lineTotalBs', il.line_total_bs,
          'position', il.position
        ) ORDER BY il.product_name ASC
      )
      FROM public.invoice_lines il
      WHERE il.invoice_id = v_invoice_id
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
