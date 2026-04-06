import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Phone, Plus, Search, ToggleLeft, ToggleRight, User } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient.js'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: '2-digit' })
}

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 10)
}

function sexLabel(value) {
  if (value === 'F') return 'Femenino'
  if (value === 'M') return 'Masculino'
  if (value === 'O') return 'Otro'
  return '—'
}

function sexShort(value) {
  if (value === 'F') return 'F'
  if (value === 'M') return 'M'
  if (value === 'O') return 'O'
  return '—'
}

function InitialAvatar({ name, phone }) {
  const initials = useMemo(() => {
    const parts = String(name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
    const base = parts.map((p) => p[0]).join('')
    if (base) return base.toUpperCase()
    const last2 = String(phone ?? '').slice(-2)
    return last2 ? last2.toUpperCase() : 'NA'
  }, [name, phone])

  return (
    <div className="grid h-11 w-11 place-items-center rounded-3xl bg-purple-50 text-purple-700 ring-1 ring-purple-200/70">
      <span className="text-sm font-extrabold">{initials}</span>
    </div>
  )
}

function SocioCard({ socio, onEdit, onToggleActive }) {
  const active = socio?.is_active !== false

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <InitialAvatar name={socio?.full_name} phone={socio?.phone} />
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-slate-900">
              {socio?.full_name || 'Sin nombre'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {socio?.phone}
              </span>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 ring-1 ring-purple-200/70">
                {sexShort(socio?.sex)}
              </span>
              <span
                className={[
                  'rounded-full px-2 py-0.5 ring-1',
                  active
                    ? 'bg-purple-50 text-purple-700 ring-purple-200/70'
                    : 'bg-pink-50 text-pink-600 ring-pink-200/70',
                ].join(' ')}
              >
                {active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
          onClick={() => onEdit(socio)}
          aria-label="Editar socio"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
          <div className="text-[11px] font-semibold text-purple-700">Sexo</div>
          <div className="mt-1 text-sm font-bold text-slate-900">
            {sexLabel(socio?.sex)}
          </div>
        </div>

        <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-purple-200/50">
          <div className="text-[11px] font-semibold text-slate-500">
            Registro
          </div>
          <div className="mt-1 text-sm font-bold text-slate-900">
            {formatDate(socio?.created_at)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-purple-700 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
          onClick={() => onToggleActive(socio)}
        >
          {active ? (
            <ToggleRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ToggleLeft className="h-4 w-4" aria-hidden="true" />
          )}
          {active ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  )
}

function Modal({ open, title, children, onClose }) {
  useEffect(() => {
    if (!open) return
    const prevHtml = document.documentElement.style.overflow
    const prevBody = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prevHtml
      document.body.style.overflow = prevBody
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 bg-black/90" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg">
        <div className="max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-purple-200/60">
          <div className="flex items-center justify-between gap-3 border-b border-purple-200/50 px-5 py-4">
            <div className="text-sm font-extrabold text-slate-900">{title}</div>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={onClose}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <div className="max-h-[calc(90vh-72px)] overflow-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function AdminSocios() {
  const PAGE_SIZE = 24

  const [socios, setSocios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [mode, setMode] = useState('create')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formSex, setFormSex] = useState('O')
  const [formPassword, setFormPassword] = useState('')

  const filtered = useMemo(() => {
    const q = String(query ?? '').trim().toLowerCase()
    if (!q) return socios
    return socios.filter((s) => {
      const name = String(s.full_name ?? '').toLowerCase()
      const phone = String(s.phone ?? '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    })
  }, [query, socios])

  const loadSocios = useCallback(async ({ reset, pageIndex } = {}) => {
    const nextPage = reset ? 0 : Number(pageIndex ?? 0)
    const from = nextPage * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const q = String(query ?? '').trim()

    setLoading(true)
    setError('')

    let request = supabase
      .from('profiles')
      .select('user_id, full_name, phone, sex, is_active, created_at', { count: 'exact' })
      .eq('role', 'socio')
      .order('created_at', { ascending: false })

    if (statusFilter === 'active') {
      request = request.or('is_active.is.null,is_active.eq.true')
    } else if (statusFilter === 'inactive') {
      request = request.eq('is_active', false)
    }

    if (q) {
      const escaped = q.replaceAll('%', '\\%').replaceAll('_', '\\_')
      request = request.or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
    }

    const { data, error: selectError, count } = await request.range(from, to)

    if (selectError) {
      setLoading(false)
      setError(selectError.message)
      return
    }

    const rows = data ?? []
    setTotalCount(typeof count === 'number' ? count : null)
    setHasMore(rows.length === PAGE_SIZE)

    if (reset) {
      setSocios(rows)
      setPage(1)
    } else {
      setSocios((prev) => {
        const existing = new Set(prev.map((p) => p.user_id))
        const next = rows.filter((r) => !existing.has(r.user_id))
        return prev.concat(next)
      })
      setPage(nextPage + 1)
    }

    setLoading(false)
  }, [PAGE_SIZE, query, statusFilter])

  useEffect(() => {
    const t = setTimeout(() => {
      loadSocios({ reset: true, pageIndex: 0 })
    }, 200)
    return () => clearTimeout(t)
  }, [loadSocios])

  function openCreate() {
    setMode('create')
    setSelected(null)
    setFormName('')
    setFormPhone('')
    setFormSex('O')
    setFormPassword('')
    setError('')
    setModalOpen(true)
  }

  function openEdit(socio) {
    setMode('edit')
    setSelected(socio)
    setFormName(socio?.full_name ?? '')
    setFormPhone(socio?.phone ?? '')
    setFormSex(socio?.sex ?? 'O')
    setFormPassword('')
    setError('')
    setModalOpen(true)
  }

  async function handleToggleActive(socio) {
    const next = socio?.is_active === false
    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ is_active: next })
      .eq('user_id', socio.user_id)
      .select('user_id, is_active')
      .maybeSingle()

    if (updateError) {
      setError(updateError.message)
      return
    }

    if (!updated?.user_id) {
      setError(
        'No se actualizó ningún registro. Revisa las políticas RLS de "profiles" para permitir que el admin actualice socios.',
      )
      return
    }

    await loadSocios({ reset: true, pageIndex: 0 })
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    const phone = normalizePhone(formPhone)
    const fullName = String(formName ?? '').trim()
    const sex = formSex

    if (!fullName) {
      setError('El nombre es obligatorio')
      return
    }
    if (mode === 'create') {
      if (!/^\d{10}$/.test(phone)) {
        setError('El celular debe tener 10 dígitos (COL sin indicativo)')
        return
      }
    }

    setSaving(true)

    if (mode === 'edit') {
      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: fullName, sex })
        .eq('user_id', selected.user_id)
        .select('user_id, full_name, sex')
        .maybeSingle()

      setSaving(false)

      if (updateError) {
        setError(updateError.message)
        return
      }

      if (!updated?.user_id) {
        setError(
          'No se actualizó ningún registro. Normalmente esto pasa por RLS: el admin no tiene permiso de UPDATE sobre "profiles" o la fila no es visible para la política.',
        )
        return
      }

      setModalOpen(false)
      await loadSocios({ reset: true, pageIndex: 0 })
      return
    }

    const password = String(formPassword ?? '').trim() || 'Socio123456'

    try {
      const url = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (!url || !anonKey) {
        throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
      }

      const adminSession = await supabase.auth.getSession()
      if (!adminSession.data.session) {
        throw new Error('No hay sesión activa')
      }

      const authEmail = `${phone}@nati.local`

      const isolated = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })

      const { data: signUpData, error: signUpError } = await isolated.auth.signUp({
        email: authEmail,
        password,
        options: {
          data: { phone, role: 'socio', full_name: fullName, sex },
        },
      })

      if (signUpError) {
        setSaving(false)
        setError(
          `${signUpError.message}. Si tu proyecto tiene confirmación de email activada, desactívala en Auth o confirma el usuario desde el Dashboard.`,
        )
        return
      }

      const userId = signUpData.user?.id
      if (!userId) {
        setSaving(false)
        setError('No se pudo obtener el usuario creado')
        return
      }

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          sex,
          role: 'socio',
          is_active: true,
        })
        .eq('user_id', userId)

      setSaving(false)

      if (profileUpdateError) {
        setError(profileUpdateError.message)
        return
      }
    } catch (err) {
      setSaving(false)
      setError(String(err?.message ?? err))
      return
    }

    setModalOpen(false)
    await loadSocios({ reset: true, pageIndex: 0 })
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestionar Socios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Crea, edita y desactiva socios. Vista en tarjetas.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Crear socio
        </button>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o celular"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={[
                'h-10 rounded-2xl border px-3 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                statusFilter === 'all'
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-purple-200/60 bg-white text-slate-900 hover:bg-purple-50',
              ].join(' ')}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={[
                'h-10 rounded-2xl border px-3 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                statusFilter === 'active'
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-purple-200/60 bg-white text-slate-900 hover:bg-purple-50',
              ].join(' ')}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={[
                'h-10 rounded-2xl border px-3 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                statusFilter === 'inactive'
                  ? 'border-pink-200 bg-pink-50 text-pink-600'
                  : 'border-purple-200/60 bg-white text-slate-900 hover:bg-purple-50',
              ].join(' ')}
            >
              Inactivos
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
          <div>
            Mostrando: <span className="text-slate-900">{filtered.length}</span>
            {typeof totalCount === 'number' ? (
              <>
                {' '}
                de <span className="text-slate-900">{totalCount}</span>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => loadSocios({ reset: true, pageIndex: 0 })}
            className="inline-flex h-9 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900"
        >
          {error}
        </div>
      ) : null}

      {loading && socios.length === 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[210px] animate-pulse rounded-3xl bg-white ring-1 ring-purple-200/50"
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 ? (
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <User className="h-4 w-4 text-purple-700" aria-hidden="true" />
                Sin resultados
              </div>
              <div className="mt-2 text-sm text-slate-500">
                No hay socios que coincidan con la búsqueda.
              </div>
            </div>
          ) : (
            filtered.map((s) => (
              <SocioCard
                key={s.user_id}
                socio={s}
                onEdit={openEdit}
                onToggleActive={handleToggleActive}
              />
            ))
          )}
        </div>
      )}

      {hasMore ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => loadSocios({ reset: false, pageIndex: page })}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
          >
            {loading ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title={mode === 'create' ? 'Crear socio' : 'Editar socio'}
        onClose={() => setModalOpen(false)}
      >
        <form className="grid gap-4" onSubmit={handleSave}>
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Nombre
            </span>
            <input
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nombre completo"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Celular
            </span>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                className={[
                  'h-11 w-full rounded-xl border bg-white pl-10 pr-3 text-sm outline-none transition',
                  mode === 'edit'
                    ? 'border-purple-200/60 text-slate-500'
                    : 'border-purple-200/60 focus:border-purple-500 focus:ring-4 focus:ring-purple-200',
                ].join(' ')}
                value={formPhone}
                onChange={(e) => setFormPhone(normalizePhone(e.target.value))}
                inputMode="numeric"
                placeholder="3001234567"
                disabled={mode === 'edit'}
              />
            </div>
            {mode === 'edit' ? (
              <div className="text-xs text-slate-500">
                El celular no se edita aquí porque está vinculado al acceso.
              </div>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Sexo
            </span>
            <select
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              value={formSex}
              onChange={(e) => setFormSex(e.target.value)}
            >
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="O">Otro</option>
            </select>
          </label>

          {mode === 'create' ? (
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">
                Contraseña
              </span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="(Opcional) Si lo dejas vacío: Socio123456"
              />
              <div className="text-xs text-slate-500">
                Esta contraseña será la del inicio de sesión del socio.
              </div>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
