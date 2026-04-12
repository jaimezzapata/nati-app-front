import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'

function formatCop(value) {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(value || 0))
  } catch {
    return `$ ${Number(value || 0).toLocaleString('es-CO')}`
  }
}

function statusPill(status) {
  if (status === 'approved') return 'bg-purple-50 text-purple-700 ring-purple-200/70'
  if (status === 'pending') return 'bg-pink-50 text-pink-600 ring-pink-200/70'
  if (status === 'rejected') return 'bg-pink-50 text-pink-600 ring-pink-200/70'
  return 'bg-purple-50 text-purple-700 ring-purple-200/70'
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
      <div className="absolute inset-0 z-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg">
        <div className="max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-purple-200/60">
          <div className="flex items-center justify-between gap-3 border-b border-purple-200/50 px-5 py-4">
            <div className="text-sm font-extrabold text-slate-900">{title}</div>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/50 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[calc(90vh-72px)] overflow-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

const BUCKET = import.meta.env.VITE_STORAGE_BUCKET || 'nati-app'

function publicUrlFor(path) {
  try {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return ''
  }
}

export default function AdminActividades() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activities, setActivities] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const selected = useMemo(() => activities.find((a) => a.id === selectedId) ?? null, [activities, selectedId])

  const [openForm, setOpenForm] = useState(false)
  const [formMode, setFormMode] = useState('create')
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Rifas')
  const [unitLabel, setUnitLabel] = useState('unidad')
  const [unitAmount, setUnitAmount] = useState('')
  const [requiredQuantity, setRequiredQuantity] = useState('1')
  const [isActive, setIsActive] = useState(true)

  const [contribLoading, setContribLoading] = useState(false)
  const [contribError, setContribError] = useState('')
  const [contributions, setContributions] = useState([])
  const [profilesById, setProfilesById] = useState(() => new Map())

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmRow, setConfirmRow] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [actingId, setActingId] = useState(null)

  const loadActivities = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: e } = await supabase
      .from('activities')
      .select('id, title, category, unit_label, unit_amount, required_quantity, is_active, created_at, created_by')
      .order('created_at', { ascending: false })

    if (e) {
      const extra = [e.code, e.hint].filter(Boolean).join(' · ')
      setError(extra ? `${e.message} (${extra})` : e.message)
      setActivities([])
      setSelectedId('')
      setLoading(false)
      return
    }

    const list = data ?? []
    setActivities(list)
    setSelectedId((prev) => prev || list[0]?.id || '')
    setLoading(false)
  }, [])

  const loadContributions = useCallback(async () => {
    if (!selectedId) {
      setContributions([])
      setProfilesById(new Map())
      return
    }

    setContribLoading(true)
    setContribError('')

    const first = await supabase
      .from('activity_contributions')
      .select('id, activity_id, user_id, quantity, unit_amount_snapshot, amount, status, comment, decision_note, created_at, created_by, paid_at, support_paths')
      .eq('activity_id', selectedId)
      .order('created_at', { ascending: false })

    if (first.error) {
      if (first.error.code === '42703' && String(first.error.message ?? '').includes('support_paths')) {
        const second = await supabase
          .from('activity_contributions')
          .select('id, activity_id, user_id, quantity, unit_amount_snapshot, amount, status, comment, decision_note, created_at, created_by, paid_at')
          .eq('activity_id', selectedId)
          .order('created_at', { ascending: false })

        if (second.error) {
          const extra = [second.error.code, second.error.hint].filter(Boolean).join(' · ')
          setContribError(extra ? `${second.error.message} (${extra})` : second.error.message)
          setContribLoading(false)
          return
        }
        setContributions(second.data ?? [])
        setProfilesById(new Map())
        setContribLoading(false)
        return
      }

      const extra = [first.error.code, first.error.hint].filter(Boolean).join(' · ')
      setContribError(extra ? `${first.error.message} (${extra})` : first.error.message)
      setContribLoading(false)
      return
    }

    const list = first.data ?? []
    setContributions(list)

    const ids = Array.from(new Set(list.map((c) => c.user_id).filter(Boolean)))
    if (!ids.length) {
      setProfilesById(new Map())
      setContribLoading(false)
      return
    }

    const { data: profiles, error: pErr } = await supabase.from('profiles').select('user_id, full_name, phone').in('user_id', ids)
    if (pErr) {
      setProfilesById(new Map())
      setContribLoading(false)
      return
    }

    const m = new Map()
    for (const p of profiles ?? []) m.set(p.user_id, p)
    setProfilesById(m)
    setContribLoading(false)
  }, [selectedId])

  useEffect(() => {
    const t = setTimeout(() => {
      loadActivities()
    }, 0)
    return () => clearTimeout(t)
  }, [loadActivities])

  useEffect(() => {
    const t = setTimeout(() => {
      loadContributions()
    }, 0)
    return () => clearTimeout(t)
  }, [loadContributions])

  function openCreate() {
    setFormMode('create')
    setTitle('')
    setCategory('Rifas')
    setUnitLabel('unidad')
    setUnitAmount('')
    setRequiredQuantity('1')
    setIsActive(true)
    setOpenForm(true)
  }

  function openEdit(a) {
    if (!a) return
    setFormMode('edit')
    setSelectedId(a.id)
    setTitle(a.title ?? '')
    setCategory(a.category ?? 'Rifas')
    setUnitLabel(a.unit_label ?? 'unidad')
    setUnitAmount(a.unit_amount != null ? String(a.unit_amount) : '')
    setRequiredQuantity(a.required_quantity != null ? String(a.required_quantity) : '1')
    setIsActive(a.is_active !== false)
    setOpenForm(true)
  }

  async function saveActivity() {
    setError('')
    const t = String(title ?? '').trim()
    if (!t) {
      setError('El título es obligatorio')
      return
    }

    const rq = Number(String(requiredQuantity ?? '').replace(/[^\d]/g, ''))
    if (!rq || rq <= 0) {
      setError('La cantidad requerida debe ser mayor a 0')
      return
    }

    const uaRaw = String(unitAmount ?? '').replace(/[^\d]/g, '')
    const ua = uaRaw ? Number(uaRaw) : 0

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setError(sessionError.message)
      return
    }
    if (!sessionData.session) {
      setError('No hay sesión activa')
      return
    }

    setSaving(true)
    const payload = {
      title: t,
      category,
      unit_label: String(unitLabel ?? '').trim() || 'unidad',
      unit_amount: ua,
      required_quantity: rq,
      is_active: Boolean(isActive),
      created_by: sessionData.session.user.id,
    }

    let r
    if (formMode === 'edit' && selected?.id) {
      r = await supabase.from('activities').update(payload).eq('id', selected.id).select('id').maybeSingle()
    } else {
      r = await supabase.from('activities').insert(payload).select('id').maybeSingle()
    }
    setSaving(false)

    if (r.error) {
      const extra = [r.error.code, r.error.hint].filter(Boolean).join(' · ')
      setError(extra ? `${r.error.message} (${extra})` : r.error.message)
      return
    }

    setOpenForm(false)
    await loadActivities()
  }

  function openConfirm(action, row) {
    setConfirmError('')
    setConfirmAction(action)
    setConfirmRow(row)
    setConfirmNote('')
    setConfirmOpen(true)
  }

  async function confirmDecision() {
    if (!confirmRow?.id || !confirmAction) return
    setConfirmError('')

    if (confirmAction === 'rejected' && !String(confirmNote ?? '').trim()) {
      setConfirmError('Escribe el motivo del rechazo')
      return
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setContribError(sessionError.message)
      return
    }
    if (!sessionData.session) {
      setContribError('No hay sesión activa')
      return
    }

    setActingId(confirmRow.id)
    const payload = {
      status: confirmAction,
      decided_at: new Date().toISOString(),
      decided_by: sessionData.session.user.id,
      decision_note: String(confirmNote ?? '').trim() || null,
    }

    const { error: updErr } = await supabase.from('activity_contributions').update(payload).eq('id', confirmRow.id)
    setActingId(null)

    if (updErr) {
      const extra = [updErr.code, updErr.hint].filter(Boolean).join(' · ')
      setContribError(extra ? `${updErr.message} (${extra})` : updErr.message)
      return
    }

    setConfirmOpen(false)
    setConfirmAction(null)
    setConfirmRow(null)
    setConfirmNote('')
    await loadContributions()
  }

  async function deleteActivity(activityId) {
    if (!activityId) return
    setError('')
    const { error: delErr } = await supabase.from('activities').delete().eq('id', activityId)
    if (delErr) {
      const extra = [delErr.code, delErr.hint].filter(Boolean).join(' · ')
      setError(extra ? `${delErr.message} (${extra})` : delErr.message)
      return
    }
    setSelectedId('')
    await loadActivities()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestionar Actividades</h1>
          <p className="mt-1 text-sm text-slate-500">
            Crea actividades obligatorias y gestiona aportes de socios (rifas, algos, comidas, otros).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadActivities}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
            aria-label="Actualizar"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-purple-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Crear
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mb-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50 lg:col-span-2">
          <div className="text-sm font-bold text-slate-900">Actividades</div>
          <div className="mt-1 text-sm text-slate-500">Selecciona una actividad para ver aportes.</div>

          {loading ? (
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
              ))}
            </div>
          ) : activities.length ? (
            <div className="mt-4 grid gap-2">
              {activities.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={[
                    'w-full rounded-2xl border px-3 py-3 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                    selectedId === a.id ? 'border-purple-200/70 bg-purple-50' : 'border-purple-200/50 bg-white hover:bg-purple-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-slate-900">{a.title}</div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        {a.category} · {a.required_quantity} {a.unit_label}
                        {Number(a.unit_amount || 0) > 0 ? ` · ${formatCop(a.unit_amount)} c/u` : ''}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${a.is_active === false ? 'bg-pink-50 text-pink-600 ring-pink-200/70' : 'bg-purple-50 text-purple-700 ring-purple-200/70'}`}>
                      {a.is_active === false ? 'Inactiva' : 'Activa'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
              <div className="text-sm font-bold text-slate-900">Sin actividades</div>
              <div className="mt-1 text-sm text-slate-500">Crea una actividad para empezar a recibir aportes.</div>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50 lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Aportes</div>
              <div className="mt-1 text-sm text-slate-500">
                {selected ? `${selected.title} · ${selected.category}` : 'Selecciona una actividad'}
              </div>
            </div>
            {selected ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => deleteActivity(selected.id)}
                  className="grid h-10 w-10 place-items-center rounded-2xl border border-pink-200/70 bg-white text-pink-600 shadow-sm transition hover:bg-pink-50 focus:outline-none focus:ring-4 focus:ring-pink-200"
                  aria-label="Eliminar actividad"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>

          {contribError ? (
            <div role="alert" className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
              {contribError}
            </div>
          ) : null}

          {selected ? (
            contribLoading ? (
              <div className="mt-4 grid gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
                ))}
              </div>
            ) : contributions.length ? (
              <div className="mt-4 grid gap-2">
                {contributions.map((c) => {
                  const p = profilesById.get(c.user_id)
                  const name = p?.full_name || 'Socio'
                  const phone = p?.phone || '—'
                  const whenValue = c?.paid_at || c?.created_at
                  const when = whenValue
                    ? new Date(whenValue).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'
                  const supports = Array.isArray(c.support_paths) ? c.support_paths : []
                  const urls = supports.map((s) => publicUrlFor(s)).filter(Boolean)

                  return (
                    <div key={c.id} className="rounded-2xl border border-purple-200/50 bg-white px-3 py-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-extrabold text-slate-900">{name} · {phone}</div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-500">
                            {when} · Cant: {c.quantity} · Total: {formatCop(c.amount)}
                          </div>
                          {c.comment ? <div className="mt-2 text-sm text-slate-700">{c.comment}</div> : null}
                          {c.status === 'rejected' && c.decision_note ? (
                            <div className="mt-2 rounded-2xl bg-pink-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-pink-200/70">
                              <div className="text-xs font-semibold text-pink-600">Motivo del rechazo</div>
                              <div className="mt-1">{c.decision_note}</div>
                            </div>
                          ) : null}
                          {urls.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {urls.slice(0, 4).map((u) => (
                                <a
                                  key={u}
                                  href={u}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block h-16 w-16 overflow-hidden rounded-2xl border border-purple-200/60 bg-white shadow-sm"
                                >
                                  <img src={u} alt="Soporte" className="h-full w-full object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(c.status)}`}>
                            {c.status === 'approved' ? 'Aprobado' : c.status === 'pending' ? 'Pendiente' : c.status === 'rejected' ? 'Rechazado' : '—'}
                          </span>
                        </div>
                      </div>

                      {c.status === 'pending' ? (
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={actingId === c.id}
                            onClick={() => openConfirm('rejected', c)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-pink-200/70 bg-white px-3 text-sm font-semibold text-pink-600 shadow-sm transition hover:bg-pink-50 focus:outline-none focus:ring-4 focus:ring-pink-200 disabled:opacity-60"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                            Rechazar
                          </button>
                          <button
                            type="button"
                            disabled={actingId === c.id}
                            onClick={() => openConfirm('approved', c)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Aprobar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
                <div className="text-sm font-bold text-slate-900">Sin aportes</div>
                <div className="mt-1 text-sm text-slate-500">Aún no hay aportes registrados para esta actividad.</div>
              </div>
            )
          ) : (
            <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
              <div className="text-sm font-bold text-slate-900">Selecciona una actividad</div>
              <div className="mt-1 text-sm text-slate-500">Elige una actividad para ver y gestionar aportes.</div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={openForm}
        title={formMode === 'edit' ? 'Editar actividad' : 'Crear actividad'}
        onClose={() => setOpenForm(false)}
      >
        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">Título</span>
            <input
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rifa - Febrero"
              disabled={saving}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Tipo</span>
              <select
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={saving}
              >
                <option value="Rifas">Rifas</option>
                <option value="Algos">Algos</option>
                <option value="Comidas">Comidas</option>
                <option value="Otros">Otros</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Activa</span>
              <select
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={isActive ? 'true' : 'false'}
                onChange={(e) => setIsActive(e.target.value === 'true')}
                disabled={saving}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Etiqueta (unidad)</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
                placeholder="boleta"
                disabled={saving}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Cantidad requerida</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                inputMode="numeric"
                value={requiredQuantity}
                onChange={(e) => setRequiredQuantity(e.target.value)}
                placeholder="1"
                disabled={saving}
              />
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">Valor por unidad (opcional)</span>
            <input
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              inputMode="numeric"
              value={unitAmount}
              onChange={(e) => setUnitAmount(e.target.value)}
              placeholder="5000"
              disabled={saving}
            />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => setOpenForm(false)}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
              onClick={saveActivity}
              disabled={saving}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        title={confirmAction === 'rejected' ? 'Confirmar rechazo' : 'Confirmar aprobación'}
        onClose={() => setConfirmOpen(false)}
      >
        <div className="grid gap-4">
          <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-purple-700">Aporte</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {confirmRow?.amount ? formatCop(confirmRow.amount) : '—'}
            </div>
          </div>

          {confirmAction === 'rejected' ? (
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Motivo del rechazo</span>
              <textarea
                className="min-h-[110px] w-full resize-none rounded-xl border border-pink-200/70 bg-white px-3 py-2 text-sm outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-200"
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                placeholder="Ej: falta soporte, valor no coincide, etc."
              />
            </label>
          ) : null}

          {confirmError ? (
            <div role="alert" className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900">
              {confirmError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={actingId === confirmRow?.id}
              className={[
                'inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 disabled:opacity-60',
                confirmAction === 'rejected'
                  ? 'bg-pink-600 hover:bg-pink-500 focus:ring-pink-200 disabled:hover:bg-pink-600'
                  : 'bg-purple-700 hover:bg-purple-500 focus:ring-purple-200 disabled:hover:bg-purple-700',
              ].join(' ')}
              onClick={confirmDecision}
            >
              {confirmAction === 'rejected' ? 'Rechazar' : 'Aprobar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
