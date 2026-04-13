# Arquitectura (nati-app)

## Stack
- Frontend: React + Vite (ESM).
- Routing: React Router (BrowserRouter).
- Estilos: TailwindCSS v4 (via `@tailwindcss/vite`).
- Iconos: `lucide-react`.
- Backend: Supabase (Auth + Postgres + RLS + Realtime).
- Despliegue: Vercel (SPA rewrite con `vercel.json`).

## Autenticación y roles
- El login se realiza con:
  - Usuario: celular colombiano de 10 dígitos (sin indicativo).
  - Password: contraseña.
- Para compatibilidad con Supabase Auth (email/password), el “email” real se deriva así:
  - `email = {phone}@nati.local`
- Roles:
  - `admin`: administra socios, aprueba/rechaza solicitudes, configura reglas.
  - `socio`: visualiza abonos, solicita abonos y préstamos.
- Perfil de usuario:
  - Se guarda en `public.profiles` (fuente de verdad del rol, teléfono, estado activo, etc.).
  - Se crea automáticamente al crear un usuario en Auth (trigger).

## Base de datos (capas)
- `auth.*`
  - Usuarios autenticados y metadatos.
- `public.*`
  - `profiles`: datos del usuario dentro de la app (rol, phone, nombre, sexo, activo).
  - `abonos`: registros por mes/quincena (con historial y estados).
  - `prestamos`: solicitudes y estado, con snapshot del interés al crear.
  - `prestamo_pagos`: pagos reportados de préstamos (interés mensual, capital o total) con aprobación del admin.
  - `loan_settings`: configuración global (interés y tope % de préstamo).
  - `activities`: actividades creadas por admin (rifas/algos/comidas/otros), con inversión/presupuesto y estado (activa/cerrada).
  - `activity_contributions`: aportes de socios a actividades (múltiples aportes permitidos), con soportes y aprobación del admin.
  - `natilleras`, `natillera_members`: estructura base para ciclo/membresía.
- RLS:
  - Propietario: ve su información (`user_id = auth.uid()`).
  - Admin: ve y gestiona todo (`is_admin()`).
  - Reglas clave:
    - Abonos: socio inserta pendiente; admin inserta/aprueba/rechaza; socio solo reenvía si está rechazado (historial).
    - Préstamos: socio crea solicitud; admin decide; motivo del rechazo se guarda y el socio lo ve.

## Arquitectura de UI
- Layouts
  - `AdminLayout`: drawer lateral, navegación, logout.
  - `SocioLayout`: navegación similar pero limitada.
- Páginas principales
  - `/login`: login + registro (modo por query `?mode=register`).
  - `/dashboard`: redirección por rol (admin -> `/admin`, socio -> `/socio`).
  - `/admin`: panel admin (dashboard, socios, abonos, préstamos).
  - `/socio`: panel socio (principal: abonos).
- Componentes críticos
  - `AbonosGrid`: grilla Dic(año-1)→Nov(año), Q1/Q2; historial por celda; masivo; aprobación masiva; fecha exacta del aporte.
  - `RequireAuth`: protege rutas autenticadas.

## Datos y sincronización
- Lecturas principales:
  - `profiles`: listados, roles, estado activo.
  - `abonos`: por usuario y por periodo.
  - `prestamos`: por usuario (socio) y global/filtrado (admin).
- Realtime:
  - Suscripción a cambios de `abonos` por `user_id` para refrescar la grilla.
- Dashboard admin (datos reales):
  - conteos desde `profiles` y `prestamos`.
  - agregados por mes desde `abonos` aprobados.
  - total ahorrado mostrado: suma de abonos aprobados menos inversión de actividades activas (UI).

## Seguridad operacional (entorno dev)
- “DangerZone” solo visible en desarrollo (Vite dev).
- Limpieza se ejecuta mediante una función SQL (RPC) en la BD para conservar únicamente el admin.

## Estructura del repositorio (alto nivel)
- `src/`
  - `components/`: componentes reutilizables (p.ej. `AbonosGrid`).
  - `layouts/`: layouts de admin y socio.
  - `pages/`: páginas (login, dashboard, admin/*, socio/*).
  - `lib/`: cliente Supabase.
- `scripts/`: utilidades Node (seed y mantenimiento).
- `vercel.json`: rewrite SPA para rutas.

## Reglas de negocio (MVP)

### Préstamos
- La solicitud guarda `interest_rate_percent` como snapshot.
- El socio puede reportar pagos en `prestamo_pagos`:
  - `interes`: pago de interés mensual.
  - `total`: liquidación (capital restante + interés acumulado).
- Validación en BD:
  - Límites configurables (`loan_settings.max_loans_per_cycle` y `loan_settings.max_active_loans`) validados por trigger al crear préstamos.
  - Para liquidación total, la BD valida un mínimo requerido y calcula `capital_monto` / `interes_monto` en función de los meses transcurridos.

### Actividades
- El admin crea una actividad con:
  - `invested_amount`: inversión/presupuesto (sale del ahorro global mientras la actividad está activa).
  - cuota por socio: `required_quantity` y `unit_amount`.
- Los socios pueden aportar múltiples veces.
- Contabilidad (a nivel de UI/funciones):
  - Mientras la actividad está activa, su inversión se descuenta del total ahorrado.
  - Al cerrar, la inversión deja de descontarse y la ganancia (recaudo aprobado - inversión) se muestra en la sección de Intereses.
