-- 1. Crear tabla para el plan de pagos de los préstamos
CREATE TABLE IF NOT EXISTS public.prestamo_pagos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prestamo_id UUID NOT NULL REFERENCES public.prestamos(id) ON DELETE CASCADE,
  socio_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('interes', 'capital', 'total')),
  monto NUMERIC NOT NULL CHECK (monto > 0),
  capital_monto NUMERIC NOT NULL DEFAULT 0,
  interes_monto NUMERIC NOT NULL DEFAULT 0,
  fecha_pago TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  mes_correspondiente VARCHAR(20), -- ej: 'Marzo 2024' (si es pago de interes mensual)
  comprobante_url TEXT,
  estado TEXT NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending', 'approved', 'rejected')),
  comentarios TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prestamo_pagos
  ADD COLUMN IF NOT EXISTS capital_monto NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.prestamo_pagos
  ADD COLUMN IF NOT EXISTS interes_monto NUMERIC NOT NULL DEFAULT 0;

UPDATE public.prestamo_pagos
SET
  capital_monto = CASE WHEN tipo IN ('capital', 'total') THEN monto ELSE 0 END,
  interes_monto = CASE WHEN tipo = 'interes' THEN monto ELSE 0 END;

ALTER TABLE public.loan_settings
  ADD COLUMN IF NOT EXISTS max_loans_per_cycle INT NOT NULL DEFAULT 5;

ALTER TABLE public.loan_settings
  ADD COLUMN IF NOT EXISTS max_active_loans INT NOT NULL DEFAULT 2;

-- Habilitar RLS
ALTER TABLE public.prestamo_pagos ENABLE ROW LEVEL SECURITY;

drop policy if exists prestamo_pagos_select_owner_admin on public.prestamo_pagos;
create policy prestamo_pagos_select_owner_admin
on public.prestamo_pagos for select
to authenticated
using (socio_id = auth.uid() or public.is_admin());

drop policy if exists prestamo_pagos_insert_owner_pending on public.prestamo_pagos;
create policy prestamo_pagos_insert_owner_pending
on public.prestamo_pagos for insert
to authenticated
with check (socio_id = auth.uid() and estado = 'pending');

drop policy if exists prestamo_pagos_update_admin on public.prestamo_pagos;
create policy prestamo_pagos_update_admin
on public.prestamo_pagos for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists prestamo_pagos_delete_admin on public.prestamo_pagos;
create policy prestamo_pagos_delete_admin
on public.prestamo_pagos for delete
to authenticated
using (public.is_admin());

-- 2. Función para obtener el ahorro total de toda la natillera
CREATE OR REPLACE FUNCTION get_natillera_total_ahorro()
RETURNS DECIMAL AS $$
DECLARE
  v_abonos DECIMAL;
  v_pendiente DECIMAL;
  v_act_out_open DECIMAL;
BEGIN
  SELECT COALESCE(SUM(a.amount), 0)
  INTO v_abonos
  FROM public.abonos a
  WHERE a.status = 'approved';

  SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(paid.capital_pagado, 0), 0)), 0)
  INTO v_pendiente
  FROM public.prestamos pr
  LEFT JOIN (
    SELECT prestamo_id, COALESCE(SUM(capital_monto), 0) AS capital_pagado
    FROM public.prestamo_pagos
    WHERE estado = 'approved'
    GROUP BY prestamo_id
  ) paid ON paid.prestamo_id = pr.id
  WHERE pr.status = 'approved';

  SELECT COALESCE(SUM(COALESCE(a.invested_amount, 0)), 0)
  INTO v_act_out_open
  FROM public.activities a
  WHERE a.is_active IS DISTINCT FROM false;

  RETURN v_abonos - COALESCE(v_act_out_open, 0) - v_pendiente;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

CREATE OR REPLACE FUNCTION public.enforce_prestamo_limits()
RETURNS trigger AS $$
DECLARE
  v_max_loans int;
  v_max_active int;
  v_cycle_approved int;
  v_active int;
BEGIN
  SELECT ls.max_loans_per_cycle, ls.max_active_loans
  INTO v_max_loans, v_max_active
  FROM public.loan_settings ls
  WHERE ls.id = 1;

  IF v_max_loans IS NULL THEN
    v_max_loans := 5;
  END IF;

  IF v_max_active IS NULL THEN
    v_max_active := 2;
  END IF;

  SELECT COUNT(*)
  INTO v_cycle_approved
  FROM public.prestamos pr
  WHERE pr.user_id = NEW.user_id
    AND pr.status = 'approved'
    AND pr.created_at >= date_trunc('year', now());

  IF v_cycle_approved >= v_max_loans THEN
    RAISE EXCEPTION 'Ya alcanzaste el máximo de préstamos aprobados del ciclo (%).', v_max_loans;
  END IF;

  SELECT COUNT(*)
  INTO v_active
  FROM public.prestamos pr
  LEFT JOIN (
    SELECT prestamo_id, COALESCE(SUM(capital_monto), 0) AS capital_pagado
    FROM public.prestamo_pagos
    WHERE estado = 'approved'
    GROUP BY prestamo_id
  ) paid ON paid.prestamo_id = pr.id
  WHERE pr.user_id = NEW.user_id
    AND pr.status = 'approved'
    AND GREATEST(pr.amount - COALESCE(paid.capital_pagado, 0), 0) > 0;

  IF v_active >= v_max_active THEN
    RAISE EXCEPTION 'Ya tienes el máximo de préstamos activos simultáneos (%).', v_max_active;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

DROP TRIGGER IF EXISTS trg_enforce_prestamo_limits ON public.prestamos;
CREATE TRIGGER trg_enforce_prestamo_limits
BEFORE INSERT ON public.prestamos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_prestamo_limits();

ALTER TABLE public.prestamos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prestamos_select_owner_admin ON public.prestamos;
CREATE POLICY prestamos_select_owner_admin
ON public.prestamos
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS prestamos_insert_owner_pending ON public.prestamos;
CREATE POLICY prestamos_insert_owner_pending
ON public.prestamos
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS prestamos_update_admin ON public.prestamos;
CREATE POLICY prestamos_update_admin
ON public.prestamos
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS invested_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS closed_by UUID;

CREATE OR REPLACE FUNCTION public.enforce_activity_quota()
RETURNS trigger AS $$
DECLARE
  v_unit numeric;
  v_qty int;
  v_expected numeric;
BEGIN
  SELECT COALESCE(a.unit_amount, 0), COALESCE(a.required_quantity, 1)
  INTO v_unit, v_qty
  FROM public.activities a
  WHERE a.id = NEW.activity_id;

  IF v_unit > 0 THEN
    v_expected := v_unit * v_qty;

    IF COALESCE(NEW.quantity, 0) < v_qty THEN
      RAISE EXCEPTION 'Cantidad inválida. Mínimo %.', v_qty;
    END IF;

    IF COALESCE(NEW.unit_amount_snapshot, 0) <> v_unit THEN
      RAISE EXCEPTION 'Valor por unidad inválido.';
    END IF;

    IF COALESCE(NEW.amount, 0) <> (v_unit * COALESCE(NEW.quantity, 0)) THEN
      RAISE EXCEPTION 'Valor inválido. Debe ser %.', (v_unit * COALESCE(NEW.quantity, 0));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

DROP TRIGGER IF EXISTS trg_enforce_activity_quota ON public.activity_contributions;
CREATE TRIGGER trg_enforce_activity_quota
BEFORE INSERT OR UPDATE ON public.activity_contributions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_activity_quota();

CREATE OR REPLACE FUNCTION public.enforce_prestamo_total_minimum()
RETURNS trigger AS $$
DECLARE
  v_principal numeric;
  v_rate numeric;
  v_paid_capital numeric;
  v_remaining numeric;
  v_months int;
  v_interest_month numeric;
  v_interest_accrued numeric;
  v_interest_paid numeric;
  v_interest_due numeric;
  v_required numeric;
BEGIN
  IF NEW.tipo <> 'total' THEN
    RETURN NEW;
  END IF;

  SELECT pr.amount, COALESCE(pr.interest_rate_percent, 0)
  INTO v_principal, v_rate
  FROM public.prestamos pr
  WHERE pr.id = NEW.prestamo_id;

  v_principal := COALESCE(v_principal, 0);
  v_rate := COALESCE(v_rate, 0);

  SELECT COALESCE(SUM(pp.capital_monto), 0)
  INTO v_paid_capital
  FROM public.prestamo_pagos pp
  WHERE pp.prestamo_id = NEW.prestamo_id
    AND pp.estado = 'approved';

  v_remaining := GREATEST(v_principal - COALESCE(v_paid_capital, 0), 0);

  v_months := GREATEST(
    0,
    (EXTRACT(YEAR FROM age(COALESCE(NEW.fecha_pago, now()), COALESCE((SELECT pr.created_at FROM public.prestamos pr WHERE pr.id = NEW.prestamo_id), now())))::int * 12)
      + EXTRACT(MONTH FROM age(COALESCE(NEW.fecha_pago, now()), COALESCE((SELECT pr.created_at FROM public.prestamos pr WHERE pr.id = NEW.prestamo_id), now())))::int
  );

  v_interest_month := (v_remaining * v_rate) / 100;
  v_interest_accrued := v_months * v_interest_month;

  SELECT COALESCE(SUM(pp.interes_monto), 0)
  INTO v_interest_paid
  FROM public.prestamo_pagos pp
  WHERE pp.prestamo_id = NEW.prestamo_id
    AND pp.estado <> 'rejected';

  v_interest_due := GREATEST(v_interest_accrued - COALESCE(v_interest_paid, 0), 0);
  v_required := v_remaining + v_interest_due;

  IF COALESCE(NEW.monto, 0) < v_required THEN
    RAISE EXCEPTION 'Monto insuficiente para liquidar. Mínimo requerido: %', v_required;
  END IF;

  NEW.capital_monto := v_remaining;
  NEW.interes_monto := GREATEST(COALESCE(NEW.monto, 0) - v_remaining, 0);
  NEW.mes_correspondiente := NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

DROP TRIGGER IF EXISTS trg_enforce_prestamo_total_minimum ON public.prestamo_pagos;
CREATE TRIGGER trg_enforce_prestamo_total_minimum
BEFORE INSERT ON public.prestamo_pagos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_prestamo_total_minimum();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.activity_contributions'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%(activity_id, user_id)%'
  LOOP
    EXECUTE format('ALTER TABLE public.activity_contributions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'activity_contributions'
      AND indexdef LIKE '%UNIQUE%'
      AND indexdef LIKE '%(activity_id, user_id)%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

-- 3. Función para obtener el ahorro total de un socio específico
CREATE OR REPLACE FUNCTION get_socio_total_ahorro(p_socio_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  total_ahorro DECIMAL;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_ahorro
  FROM abonos
  WHERE status = 'approved' AND user_id = p_socio_id;
  
  RETURN total_ahorro;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

CREATE OR REPLACE FUNCTION get_socio_max_prestamo(p_socio_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_user_savings DECIMAL;
  v_max_percent DECIMAL;
  v_cap_by_savings DECIMAL;
  v_abonos DECIMAL;
  v_intereses DECIMAL;
  v_pendiente DECIMAL;
  v_available DECIMAL;
BEGIN
  SELECT ls.max_loan_percent
  INTO v_max_percent
  FROM public.loan_settings ls
  WHERE ls.id = 1;

  IF v_max_percent IS NULL THEN
    v_max_percent := 70;
  END IF;

  v_user_savings := public.get_socio_total_ahorro(p_socio_id);
  v_cap_by_savings := v_user_savings * (v_max_percent / 100);

  SELECT COALESCE(SUM(a.amount), 0)
  INTO v_abonos
  FROM public.abonos a
  WHERE a.status = 'approved';

  SELECT COALESCE(SUM(pp.interes_monto), 0)
  INTO v_intereses
  FROM public.prestamo_pagos pp
  WHERE pp.estado = 'approved';

  SELECT COALESCE(SUM(GREATEST(pr.amount - COALESCE(paid.capital_pagado, 0), 0)), 0)
  INTO v_pendiente
  FROM public.prestamos pr
  LEFT JOIN (
    SELECT prestamo_id, COALESCE(SUM(capital_monto), 0) AS capital_pagado
    FROM public.prestamo_pagos
    WHERE estado = 'approved'
    GROUP BY prestamo_id
  ) paid ON paid.prestamo_id = pr.id
  WHERE pr.status = 'approved';

  v_available := v_abonos + v_intereses - v_pendiente;
  IF v_available < 0 THEN
    v_available := 0;
  END IF;

  RETURN LEAST(v_cap_by_savings, v_available);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;
