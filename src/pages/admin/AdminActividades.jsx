import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
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

function ErrorBanner({ message, className = '' }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={[
        'rounded-3xl border border-pink-300 bg-pink-50 px-4 py-3 text-sm font-semibold text-pink-900 shadow-sm',
        'ring-1 ring-pink-200/70',
        className,
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pink-700" aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-xs font-extrabold uppercase tracking-wide text-pink-700">Error</div>
          <div className="mt-0.5 break-words">{message}</div>
        </div>
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
  const [investedAmount, setInvestedAmount] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [contribLoading, setContribLoading] = useState(false)
  const [contribError, setContribError] = useState('')
  const [contributions, setContributions] = useState([])
  const [profilesById, setProfilesById] = useState(() => new Map())
  const [memberIds, setMemberIds] = useState([])

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmRow, setConfirmRow] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [actingId, setActingId] = useState(null)

  const [closeOpen, setCloseOpen] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [closing, setClosing] = useState(false)

  const loadActivities = useCallback(async () => {
    setLoading(true)
    setError('')

    let { data, error: e } = await supabase
      .from('activities')
      .select('id, title, category, unit_label, unit_amount, required_quantity, invested_amount, is_active, created_at, created_by')
      .order('created_at', { ascending: false })

    if (e?.code === '42703' || e?.code === 'PGRST204') {
      const retry = await supabase
        .from('activities')
        .select('id, title, category, unit_label, unit_amount, required_quantity, is_active, created_at, created_by')
        .order('created_at', { ascending: false })
      data = retry.data
      e = retry.error
    }

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
      setMemberIds([])
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
    if (ids.length) {
      const { data: profiles, error: pErr } = await supabase.from('profiles').select('user_id, full_name, phone').in('user_id', ids)
      if (!pErr) {
        const m = new Map()
        for (const p of profiles ?? []) m.set(p.user_id, p)
        setProfilesById(m)
      } else {
        setProfilesById(new Map())
      }
    } else {
      setProfilesById(new Map())
    }

    const { data: members, error: mErr } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('is_active', true)
      .eq('role', 'socio')
    if (!mErr) setMemberIds((members ?? []).map((m) => m.user_id).filter(Boolean))
    else setMemberIds([])
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
    setInvestedAmount('')
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
    setInvestedAmount(a.invested_amount != null ? String(a.invested_amount) : '')
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

    const invRaw = String(investedAmount ?? '').replace(/[^\d]/g, '')
    const inv = invRaw ? Number(invRaw) : 0
    if (!Number.isFinite(inv) || inv < 0) {
      setError('La inversión debe ser 0 o mayor')
      return
    }

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
      invested_amount: inv,
      is_active: Boolean(isActive),
      created_by: sessionData.session.user.id,
    }

    let r
    if (formMode === 'edit' && selected?.id) {
      r = await supabase.from('activities').update(payload).eq('id', selected.id).select('id').maybeSingle()
    } else {
      r = await supabase.from('activities').insert(payload).select('id').maybeSingle()
    }
    if (r.error?.code === '42703' || r.error?.code === 'PGRST204') {
      const fallbackPayload = {
        title: t,
        category,
        unit_label: String(unitLabel ?? '').trim() || 'unidad',
        unit_amount: ua,
        required_quantity: rq,
        is_active: Boolean(isActive),
        created_by: sessionData.session.user.id,
      }
      if (formMode === 'edit' && selected?.id) {
        r = await supabase.from('activities').update(fallbackPayload).eq('id', selected.id).select('id').maybeSingle()
      } else {
        r = await supabase.from('activities').insert(fallbackPayload).select('id').maybeSingle()
      }
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

  const activityStats = useMemo(() => {
    const memberCount = memberIds.length
    let approvedSum = 0
    const approvedUsers = new Set()
    const pendingUsers = new Set()
    const anyUsers = new Set()

    for (const c of contributions) {
      if (c.user_id) anyUsers.add(c.user_id)
      const amt = Number(c.amount || 0)
      if (c.status === 'approved') {
        if (c.user_id) approvedUsers.add(c.user_id)
        approvedSum += Number.isFinite(amt) ? amt : 0
      } else if (c.status === 'pending') {
        if (c.user_id) pendingUsers.add(c.user_id)
      }
    }

    const participated = new Set([...approvedUsers, ...pendingUsers])
    const missing = Math.max(memberCount - participated.size, 0)
    const invested = Number(selected?.invested_amount || 0)
    const profit = Math.max(approvedSum - (Number.isFinite(invested) ? invested : 0), 0)

    return {
      memberCount,
      approvedSum,
      invested: Number.isFinite(invested) ? invested : 0,
      profit,
      approvedUsers: approvedUsers.size,
      pendingUsers: pendingUsers.size,
      anyUsers: anyUsers.size,
      missingUsers: missing,
      completed: memberCount > 0 && approvedUsers.size >= memberCount,
    }
  }, [contributions, memberIds.length, selected?.invested_amount])

  async function closeSelectedActivity() {
    if (!selected?.id) return
    setCloseError('')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setCloseError(sessionError.message)
      return
    }
    if (!sessionData.session) {
      setCloseError('No hay sesión activa')
      return
    }

    setClosing(true)
    const nowIso = new Date().toISOString()
    const payload = {
      is_active: false,
      closed_at: nowIso,
      closed_by: sessionData.session.user.id,
    }

    let { error: updErr } = await supabase.from('activities').update(payload).eq('id', selected.id)
    if (updErr?.code === '42703' || updErr?.code === 'PGRST204') {
      const retry = await supabase.from('activities').update({ is_active: false }).eq('id', selected.id)
      updErr = retry.error
    }

    setClosing(false)
    if (updErr) {
      const extra = [updErr.code, updErr.hint].filter(Boolean).join(' · ')
      setCloseError(extra ? `${updErr.message} (${extra})` : updErr.message)
      return
    }

    setCloseOpen(false)
    await loadActivities()
    await loadContributions()
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

      <ErrorBanner message={error} className="mb-3" />

      <div className="grid gap-4">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Actividades</div>
              <div className="mt-1 text-sm text-slate-500">En curso y pasadas.</div>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
              ))}
            </div>
          ) : activities.length ? (
            <div className="mt-4 grid gap-4">
              <div className="overflow-x-auto rounded-3xl ring-1 ring-purple-200/60">
                <table className="w-full min-w-[1180px] border-separate border-spacing-0">
                  <thead className="bg-purple-50">
                    <tr className="text-left text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">Actividad</th>
                      <th className="px-4 py-3">Cuota</th>
                      <th className="px-4 py-3">Inversión</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-200/40 bg-white text-sm text-slate-900">
                    {activities
                      .filter((a) => a.is_active !== false)
                      .map((a) => (
                        <tr
                          key={a.id}
                          onClick={() => setSelectedId(a.id)}
                          className={['cursor-pointer', selectedId === a.id ? 'bg-purple-50' : 'hover:bg-purple-50'].join(' ')}
                        >
                          <td className="px-4 py-3">
                            <div className="truncate font-extrabold">{a.title}</div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-500">{a.category}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {a.required_quantity} {a.unit_label}
                              {Number(a.unit_amount || 0) > 0 ? ` · ${formatCop(a.unit_amount)} c/u` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-extrabold">{formatCop(a.invested_amount ?? 0)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-purple-200/70">
                              Activa
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedId(a.id)
                                  setCloseError('')
                                  setCloseOpen(true)
                                }}
                                className="inline-flex h-9 items-center justify-center rounded-2xl bg-purple-700 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200"
                              >
                                Cerrar
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEdit(a)
                                }}
                                className="inline-flex h-9 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteActivity(a.id)
                                }}
                                className="inline-flex h-9 items-center justify-center rounded-2xl border border-pink-200/70 bg-white px-3 text-xs font-extrabold text-pink-600 shadow-sm transition hover:bg-pink-50 focus:outline-none focus:ring-4 focus:ring-pink-200"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {activities.some((a) => a.is_active === false) ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-xs font-extrabold text-slate-700">
                          Pasadas
                        </td>
                      </tr>
                    ) : null}
                    {activities
                      .filter((a) => a.is_active === false)
                      .map((a) => (
                        <tr
                          key={a.id}
                          onClick={() => setSelectedId(a.id)}
                          className={['cursor-pointer', selectedId === a.id ? 'bg-purple-50' : 'hover:bg-purple-50'].join(' ')}
                        >
                          <td className="px-4 py-3">
                            <div className="truncate font-extrabold">{a.title}</div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-500">{a.category}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {a.required_quantity} {a.unit_label}
                              {Number(a.unit_amount || 0) > 0 ? ` · ${formatCop(a.unit_amount)} c/u` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-extrabold">{formatCop(a.invested_amount ?? 0)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-semibold text-pink-600 ring-1 ring-pink-200/70">
                              Cerrada
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEdit(a)
                                }}
                                className="inline-flex h-9 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteActivity(a.id)
                                }}
                                className="inline-flex h-9 items-center justify-center rounded-2xl border border-pink-200/70 bg-white px-3 text-xs font-extrabold text-pink-600 shadow-sm transition hover:bg-pink-50 focus:outline-none focus:ring-4 focus:ring-pink-200"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
              <div className="text-sm font-bold text-slate-900">Sin actividades</div>
              <div className="mt-1 text-sm text-slate-500">Crea una actividad para empezar a recibir aportes.</div>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Aportes</div>
              <div className="mt-1 text-sm text-slate-500">
                {selected ? `${selected.title} · ${selected.category}` : 'Selecciona una actividad'}
              </div>
            </div>
          </div>

          <ErrorBanner message={contribError} className="mt-3" />

          {selected && !contribLoading ? (
            <div className="mt-3 overflow-x-auto rounded-3xl ring-1 ring-purple-200/60">
              <table className="w-full min-w-[980px] border-separate border-spacing-0">
                <thead className="bg-purple-50">
                  <tr className="text-left text-xs font-extrabold text-slate-700">
                    <th className="px-4 py-3">Inversión</th>
                    <th className="px-4 py-3">Recaudo aprobado</th>
                    <th className="px-4 py-3">Ganancia</th>
                    <th className="px-4 py-3">Aprobados</th>
                    <th className="px-4 py-3">Pendientes</th>
                    <th className="px-4 py-3">Sin aporte</th>
                  </tr>
                </thead>
                <tbody className="bg-white text-sm text-slate-900">
                  <tr>
                    <td className="px-4 py-3 whitespace-nowrap font-extrabold">{formatCop(activityStats.invested)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-extrabold">{formatCop(activityStats.approvedSum)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-extrabold text-purple-700">{formatCop(activityStats.profit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-extrabold">
                      {activityStats.approvedUsers}/{activityStats.memberCount}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-extrabold">{activityStats.pendingUsers}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-extrabold">{activityStats.missingUsers}</td>
                  </tr>
                </tbody>
              </table>
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
              <div className="mt-4 overflow-x-auto rounded-3xl ring-1 ring-purple-200/60">
                <table className="w-full min-w-[1180px] border-separate border-spacing-0">
                  <thead className="bg-purple-50">
                    <tr className="text-left text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Socio</th>
                      <th className="px-4 py-3">Teléfono</th>
                      <th className="px-4 py-3">Cantidad</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Soporte</th>
                      <th className="px-4 py-3">Comentario / Motivo</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-200/40 bg-white text-sm text-slate-900">
                    {contributions.map((c) => {
                      const p = profilesById.get(c.user_id)
                      const name = p?.full_name || 'Socio'
                      const phone = p?.phone || '—'
                      const whenValue = c?.paid_at || c?.created_at
                      const when = whenValue
                        ? new Date(whenValue).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'
                      const supports = Array.isArray(c.support_paths) ? c.support_paths : []
                      const url = supports.length ? publicUrlFor(supports[0]) : ''
                      const note = c.status === 'rejected' ? (c.decision_note || '') : (c.comment || '')

                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-3 whitespace-nowrap">{when}</td>
                          <td className="px-4 py-3">{name}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{phone}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{c.quantity}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-extrabold">{formatCop(c.amount)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(c.status)}`}>
                              {c.status === 'approved' ? 'Aprobado' : c.status === 'pending' ? 'Pendiente' : c.status === 'rejected' ? 'Rechazado' : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                              >
                                Ver
                              </a>
                            ) : (
                              <span className="text-xs font-semibold text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[420px]">
                            <div className="truncate text-sm text-slate-700">{note || '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {c.status === 'pending' ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={actingId === c.id}
                                  onClick={() => openConfirm('rejected', c)}
                                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-pink-200/70 bg-white px-3 text-xs font-extrabold text-pink-600 shadow-sm transition hover:bg-pink-50 focus:outline-none focus:ring-4 focus:ring-pink-200 disabled:opacity-60"
                                >
                                  Rechazar
                                </button>
                                <button
                                  type="button"
                                  disabled={actingId === c.id}
                                  onClick={() => openConfirm('approved', c)}
                                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-purple-700 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
                                >
                                  Aprobar
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">Inversión (costo)</span>
            <input
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              inputMode="numeric"
              value={investedAmount}
              onChange={(e) => setInvestedAmount(e.target.value)}
              placeholder="Ej: 150000"
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
        open={closeOpen}
        title="Cerrar actividad"
        onClose={() => {
          setCloseOpen(false)
          setCloseError('')
        }}
      >
        <div className="grid gap-4">
          <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-purple-700">Actividad</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {selected ? `${selected.title} · ${selected.category}` : '—'}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-purple-200/60">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">Inversión</span>
              <span className="font-extrabold text-slate-900">{formatCop(activityStats.invested)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">Recaudo aprobado</span>
              <span className="font-extrabold text-slate-900">{formatCop(activityStats.approvedSum)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">Ganancia (excedente)</span>
              <span className="font-extrabold text-purple-700">{formatCop(activityStats.profit)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">Participación</span>
              <span className="font-extrabold text-slate-900">
                {activityStats.approvedUsers}/{activityStats.memberCount} aprobados
              </span>
            </div>
            {activityStats.missingUsers ? (
              <div className="rounded-2xl bg-pink-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-pink-200/70">
                Faltan <span className="font-extrabold">{activityStats.missingUsers}</span> socio(s) por aportar.
              </div>
            ) : null}
          </div>

          <ErrorBanner message={closeError} />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => {
                setCloseOpen(false)
                setCloseError('')
              }}
              disabled={closing}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={closing || !selected || selected.is_active === false}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
              onClick={closeSelectedActivity}
            >
              {closing ? 'Cerrando…' : 'Cerrar actividad'}
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

          <ErrorBanner message={confirmError} />

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
