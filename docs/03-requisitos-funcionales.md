# Plan de trabajo (requisitos funcionales)

## 1. Autenticación y acceso
- RF-01: Permitir inicio de sesión con usuario numérico (celular COL 10 dígitos) + contraseña.
- RF-02: Derivar el email técnico de login como `{phone}@nati.local`.
- RF-03: Crear/asegurar `profiles` automáticamente al registrarse (trigger).
- RF-04: Enrutamiento por rol:
  - admin → `/admin`
  - socio → `/socio`
- RF-05: Bloquear usuarios desactivados (`profiles.is_active=false`) y forzar cierre de sesión.

## 2. Paneles y navegación
- RF-06: Layout admin con menú lateral (drawer) y logout.
- RF-07: Layout socio con menú limitado (abonos y préstamos) y logout.
- RF-08: La pantalla principal del socio debe ser Abonos (`/socio` redirige a `/socio/abonos`).

## 3. Gestión de socios (admin)
- RF-09: Listar socios desde `profiles` (filtro role='socio').
- RF-10: Crear socio desde la UI sin romper la sesión del admin.
- RF-11: Editar socio (nombre, sexo) y persistir en `profiles`.
- RF-12: Activar/Desactivar socio (`profiles.is_active`).
- RF-13: Búsqueda por nombre/teléfono + paginación.

## 4. Abonos (aportes)

### 4.1 Estructura de periodo
- RF-14: Mostrar grilla de 12 meses desde Dic (año-1) hasta Nov (año actual).
- RF-15: Cada mes tiene 2 quincenas (Q1/Q2).

### 4.2 Registro y solicitudes
- RF-16: Admin puede registrar abonos para cualquier socio.
- RF-17: Socio solo puede enviar solicitudes de abono (estado pendiente).
- RF-18: Admin puede aprobar o rechazar solicitudes.
- RF-19: El mismo admin también puede auto-reportarse abonos (admin se incluye como “persona” en el selector).

### 4.3 Restricciones por estado
- RF-20: Socio no puede modificar un abono si está pendiente o aprobado.
- RF-21: Socio solo puede re-enviar cuando el último estado sea rechazado.

### 4.4 Historial
- RF-22: Cuando un abono sea rechazado, se conserva el historial.
- RF-23: Reenvío de socio crea un nuevo intento (no sobrescribe el rechazado).

### 4.5 Fecha exacta del aporte
- RF-24: Cada abono debe capturar la fecha exacta del aporte (`paid_at`) tanto en registro individual como masivo.

### 4.6 Aportes masivos
- RF-25: Permitir seleccionar rango de meses (desde/hasta) para registrar abonos masivos.
- RF-26: Permitir seleccionar quincena (Q1, Q2 o ambas).
- RF-27: Permitir registrar masivamente un valor “por cuota”.
- RF-28: Admin puede aprobar masivamente abonos pendientes por rango/quincena.

## 5. Préstamos

### 5.1 Reglas globales (admin)
- RF-29: Configurar % interés.
- RF-30: Configurar tope máximo como % del total ahorrado.
- RF-31: Defaults: interés 5%, tope 70%.

### 5.2 Solicitud (socio)
- RF-32: Socio puede crear solicitudes de préstamo.
- RF-33: La solicitud guarda el % interés vigente en el momento (snapshot) y no cambia si luego el admin ajusta la regla.

### 5.3 Decisión (admin)
- RF-34: Admin ve solicitudes y puede aprobar/rechazar.
- RF-35: Al aprobar/rechazar debe existir confirmación.
- RF-36: Si se rechaza, el admin debe escribir el motivo; el socio debe ver ese motivo.

## 6. Dashboard (admin)
- RF-37: Dashboard debe usar datos reales desde la base de datos:
  - socios activos
  - total ahorrado (abonos aprobados)
  - agregación mensual Dic→Nov
  - préstamos activos

## 7. Herramientas de desarrollo (solo dev)
- RF-38: DangerZone visible solo en desarrollo.
- RF-39: Debe existir un botón que ejecute limpieza masiva en Supabase y deje solo el admin.

## 8. Despliegue
- RF-40: Configurar rewrite SPA para que las rutas no fallen al refrescar en Vercel.
