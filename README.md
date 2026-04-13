# nati-app — MVP Natillera

Aplicación web para administrar una **natillera** (ahorro + préstamos + actividades) con dos roles: **Admin** y **Socio**.

El MVP cubre:
- Abonos por mes/quincena (con historial, aprobaciones y soportes).
- Préstamos: solicitud, aprobación/rechazo, pagos (interés mensual y liquidación total).
- Actividades (rifas/algos/comidas/otros): creación por admin, aportes por socio, cierre y cálculo de ganancia.
- Tabla de **Intereses** (admin): historial unificado de intereses por préstamos + ganancias por actividades.

Documentación técnica adicional:
- [Arquitectura](docs/01-arquitectura.md)
- [UI/UX](docs/02-ui.md)
- [Requisitos funcionales](docs/03-requisitos-funcionales.md)

## Stack
- Frontend: React + Vite (ESM)
- Routing: React Router
- Estilos: TailwindCSS v4 (via `@tailwindcss/vite`)
- Backend: Supabase (Auth + Postgres + RLS + Storage)
- Deploy: Vercel (SPA rewrite con `vercel.json`)

## Roles y módulos

### Admin
- Dashboard: métricas y gráficas (ahorro mensual, conteos).
- Socios: crear/editar/activar/desactivar.
- Abonos: gestionar abonos por socio, aprobar/rechazar, masivos, soportes.
- Préstamos: configurar reglas, ver solicitudes, aprobar/rechazar, ver pagos reportados.
- Actividades: crear/cerrar actividades, ver aportes y aprobar/rechazar aportes.
- Intereses: ver totales y **historial** (interés de préstamos + ganancia de actividades cerradas).

### Socio
- Abonos: enviar solicitud de abono por quincena, reintentar si fue rechazado, adjuntar soportes.
- Préstamos: solicitar, ver estado/motivo, reportar pagos (interés mensual o total) con soporte.
- Actividades: aportar a actividades activas (cantidad mínima) y adjuntar soporte. Puede hacer múltiples aportes.

## Variables de entorno

Crear un archivo `.env.local` (no se versiona) con:

```bash
VITE_SUPABASE_URL="https://TU-PROYECTO.supabase.co"
VITE_SUPABASE_ANON_KEY="TU_ANON_KEY"
VITE_STORAGE_BUCKET="nati-app"
VITE_DEBUG_SUPABASE="false"
```

Notas:
- `VITE_STORAGE_BUCKET` por defecto es `nati-app`.
- `VITE_DEBUG_SUPABASE=true` activa logs de requests/responses de Supabase en consola (con valores redactados).

## Setup local

```bash
npm install
npm run dev
```

Scripts útiles:
- `npm run dev`: servidor local
- `npm run build`: build de producción
- `npm run preview`: servir build
- `npm run lint`: ESLint

## Base de datos (Supabase)

La app asume:
- Auth con email/password, usando un “email técnico” derivado del teléfono: `{phone}@nati.local`.
- Perfil en `public.profiles` como fuente de verdad del rol y estado.
- RLS activo para proteger lecturas/escrituras.

SQL del proyecto (referencia y actualizaciones):
- Base (core): [docs/04-db-postgresql.sql](docs/04-db-postgresql.sql)
- Extensiones (pagos de préstamos, límites, validaciones): [dos/db_prestamo_pagos.sql](dos/db_prestamo_pagos.sql)

Si el esquema de tu Supabase ya existe, ejecuta solo las partes que falten (por ejemplo columnas nuevas o funciones).

## Storage (Supabase)

Se usa Storage para soportes:
- Abonos: `abonos/{userId}/{periodDate}/q{quincena}/...`
- Préstamos: `prestamos/{userId}/...`
- Actividades: `actividades/{userId}/{activityId}/...`

## Seed (opcional)

El repo incluye un seed para crear usuarios demo y una natillera:

```bash
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." npm run seed:supabase
```

Variables opcionales:
- `ADMIN_PHONE`, `ADMIN_PASSWORD`
- `SOCIO_PHONE`, `SOCIO_PASSWORD`

## Deploy (Vercel)

`vercel.json` incluye un rewrite SPA para que las rutas de React Router funcionen al refrescar.

## Estructura del repo (alto nivel)
- `src/`
  - `components/`: componentes reutilizables (`AbonosGrid`, `RequireAuth`)
  - `layouts/`: layouts de admin y socio
  - `pages/`: páginas por rol
  - `lib/`: cliente Supabase
- `docs/`: documentación funcional/técnica
- `dos/`: SQL de extensiones/ajustes
- `scripts/`: utilidades (seed)
