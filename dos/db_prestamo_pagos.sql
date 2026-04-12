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
  v_intereses DECIMAL;
  v_pendiente DECIMAL;
BEGIN
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

  RETURN v_abonos + v_intereses - v_pendiente;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

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
