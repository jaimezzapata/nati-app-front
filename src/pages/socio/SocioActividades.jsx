import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw, Send, Upload } from 'lucide-react'
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

function toDatetimeLocal(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function datetimeLocalToIso(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function statusPill(status) {
  if (status === 'approved') return 'bg-purple-50 text-purple-700 ring-purple-200/70'
  if (status === 'pending') return 'bg-pink-50 text-pink-600 ring-pink-200/70'
  if (status === 'rejected') return 'bg-pink-50 text-pink-600 ring-pink-200/70'
  return 'bg-purple-50 text-purple-700 ring-purple-200/70'
}

function guessExtFromName(name) {
  const n = String(name ?? '')
  const idx = n.lastIndexOf('.')
  if (idx === -1) return 'jpg'
  return n.slice(idx + 1).toLowerCase() || 'jpg'
}

const BUCKET = import.meta.env.VITE_STORAGE_BUCKET || 'nati-app'

function publicUrlFor(path) {
  try {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return ''
  }
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-3 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-purple-200/60">
        <div className="flex items-start justify-between gap-3 p-4 pb-0">
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-slate-900">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
          >
            Cerrar
          </button>
        </div>
        <div className="max-h-[86vh] overflow-auto p-4 pt-4">{children}</div>
      </div>
    </div>
  )
}

export default function SocioActividades() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activities, setActivities] = useState([])
  const [contribsByActivity, setContribsByActivity] = useState(() => new Map())

  const [openId, setOpenId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [paidAt, setPaidAt] = useState(toDatetimeLocal(new Date().toISOString()))
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)

  const openActivity = useMemo(() => activities.find((a) => a.id === openId) ?? null, [activities, openId])
  const myContribs = useMemo(() => (openId ? contribsByActivity.get(openId) ?? [] : []), [contribsByActivity, openId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setError(sessionError.message)
      setLoading(false)
      return
    }
    if (!sessionData.session) {
      setError('No hay sesión activa')
      setLoading(false)
      return
    }

    const userId = sessionData.session.user.id

    const [actRes, contribRes] = await Promise.all([
      supabase
        .from('activities')
        .select('id, title, category, unit_label, unit_amount, required_quantity, is_active, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('activity_contributions')
        .select('id, activity_id, user_id, quantity, unit_amount_snapshot, amount, status, comment, decision_note, created_at, paid_at, support_paths')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ])

    if (actRes.error) {
      const extra = [actRes.error.code, actRes.error.hint].filter(Boolean).join(' · ')
      setError(extra ? `${actRes.error.message} (${extra})` : actRes.error.message)
      setActivities([])
      setContribsByActivity(new Map())
      setLoading(false)
      return
    }

    if (contribRes.error) {
      const extra = [contribRes.error.code, contribRes.error.hint].filter(Boolean).join(' · ')
      setError(extra ? `${contribRes.error.message} (${extra})` : contribRes.error.message)
      setActivities(actRes.data ?? [])
      setContribsByActivity(new Map())
      setLoading(false)
      return
    }

    const acts = actRes.data ?? []
    setActivities(acts)

    const map = new Map()
    for (const c of contribRes.data ?? []) {
      if (!c.activity_id) continue
      const prev = map.get(c.activity_id) || []
      prev.push(c)
      map.set(c.activity_id, prev)
    }
    setContribsByActivity(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(t)
  }, [load])

  function open(a) {
    setError('')
    setOpenId(a.id)
    setQuantity(String(a.required_quantity ?? 1))
    const unit = Number(a.unit_amount || 0)
    const q = Number(a.required_quantity ?? 1)
    const suggested = unit > 0 ? unit * q : 0
    setAmount(suggested ? String(suggested) : '')
    setComment('')
    setPaidAt(toDatetimeLocal(new Date().toISOString()))
    setFiles([])
  }

  async function submit() {
    setError('')
    if (!openActivity) return
    if (openActivity.is_active === false) {
      setError('Esta actividad ya fue cerrada.')
      return
    }

    const qRaw = String(quantity ?? '').replace(/[^\d]/g, '')
    const q = qRaw ? Number(qRaw) : 0
    if (!Number.isFinite(q) || q < 1 || !Number.isInteger(q)) {
      setError('La cantidad debe ser un entero mayor o igual a 1')
      return
    }

    const unitSnapshot = Number(openActivity.unit_amount || 0)
    const minRequired = Number(openActivity.required_quantity ?? 1)
    if (unitSnapshot > 0 && Number.isFinite(minRequired) && minRequired > 0 && q < minRequired) {
      setError(`La cantidad mínima para esta actividad es ${minRequired}`)
      return
    }

    const expected = unitSnapshot > 0 ? unitSnapshot * q : 0
    let numeric = 0
    if (expected > 0) {
      numeric = expected
    } else {
      const raw = String(amount ?? '').replace(/[^\d]/g, '')
      numeric = raw ? Number(raw) : 0
      if (!numeric || numeric <= 0) {
        setError('Ingresa un valor válido')
        return
      }
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

    const userId = sessionData.session.user.id
    const paidIso = datetimeLocalToIso(paidAt) || new Date().toISOString()

    setSending(true)
    try {
      const supportPaths = []
      if (files.length) {
        for (const f of files) {
          const ext = guessExtFromName(f.name)
          const path = `actividades/${userId}/${openActivity.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || undefined })
          if (upErr) throw upErr
          supportPaths.push(path)
        }
      }

      const payload = {
        activity_id: openActivity.id,
        user_id: userId,
        quantity: q,
        unit_amount_snapshot: unitSnapshot,
        amount: numeric,
        status: 'pending',
        comment: String(comment ?? '').trim() || null,
        created_by: userId,
        created_at: new Date().toISOString(),
        paid_at: paidIso,
        support_paths: supportPaths.length ? supportPaths : null,
      }

      const { error: insErr } = await supabase.from('activity_contributions').insert(payload)
      if (insErr) {
        throw insErr
      }

      setSending(false)
      await load()
      setFiles([])
      setComment('')
      setPaidAt(toDatetimeLocal(new Date().toISOString()))
    } catch (e) {
      setSending(false)
      setError(String(e?.message ?? e))
    }
  }

  const activeActivities = useMemo(() => activities.filter((a) => a.is_active !== false), [activities])
  const pastActivities = useMemo(() => activities.filter((a) => a.is_active === false), [activities])

  const summaryByActivity = useMemo(() => {
    const m = new Map()
    for (const a of activities) {
      const list = contribsByActivity.get(a.id) || []
      let approved = 0
      let pending = 0
      let rejected = 0
      let approvedSum = 0
      for (const c of list) {
        if (c.status === 'approved') {
          approved += 1
          const amt = Number(c.amount || 0)
          approvedSum += Number.isFinite(amt) ? amt : 0
        } else if (c.status === 'pending') pending += 1
        else if (c.status === 'rejected') rejected += 1
      }
      m.set(a.id, { approved, pending, rejected, total: list.length, approvedSum })
    }
    return m
  }, [activities, contribsByActivity])

  const missingMandatoryCount = useMemo(() => {
    let c = 0
    for (const a of activeActivities) {
      const s = summaryByActivity.get(a.id) || { approved: 0, pending: 0 }
      if ((s.approved || 0) + (s.pending || 0) === 0) c += 1
    }
    return c
  }, [activeActivities, summaryByActivity])

  function statusForActivity(activityId) {
    const s = summaryByActivity.get(activityId)
    if (!s) return { label: 'Sin enviar', pill: statusPill() }
    if (s.approved > 0) return { label: 'Aprobado', pill: statusPill('approved') }
    if (s.pending > 0) return { label: 'Pendiente', pill: statusPill('pending') }
    if (s.rejected > 0) return { label: 'Rechazado', pill: statusPill('rejected') }
    return { label: 'Sin enviar', pill: statusPill() }
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Actividades</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registra tu aporte y envía soporte si aplica. La admin lo revisa.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
          aria-label="Actualizar"
          title="Actualizar"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <div role="alert" className="mb-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
          {error}
        </div>
      ) : null}

      {missingMandatoryCount ? (
        <div className="mb-3 rounded-3xl border border-pink-200 bg-pink-50 p-4 text-slate-900 shadow-sm">
          <div className="text-sm font-extrabold">Tienes actividades obligatorias pendientes</div>
          <div className="mt-1 text-sm text-slate-700">
            Debes reportar al menos un aporte en <span className="font-extrabold">{missingMandatoryCount}</span> actividad(es) en curso.
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
          ))}
        </div>
      ) : activities.length ? (
        <div className="grid gap-3">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">Actividades en curso</div>
              <div className="text-xs font-semibold text-slate-500">{activeActivities.length}</div>
            </div>
            {activeActivities.length ? (
              <div className="mt-3 overflow-x-auto rounded-3xl ring-1 ring-purple-200/60">
                <table className="w-full min-w-[980px] border-separate border-spacing-0">
                  <thead className="bg-purple-50">
                    <tr className="text-left text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">Actividad</th>
                      <th className="px-4 py-3">Cuota</th>
                      <th className="px-4 py-3">Mi estado</th>
                      <th className="px-4 py-3">Mis aportes</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-200/40 bg-white">
                    {activeActivities.map((a) => {
                      const s = summaryByActivity.get(a.id) || { total: 0, approvedSum: 0 }
                      const st = statusForActivity(a.id)
                      return (
                        <tr key={a.id} className="text-sm text-slate-900">
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
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.pill}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-extrabold">{s.total}</span>
                            <span className="text-xs font-semibold text-slate-500"> · Aprobado: {formatCop(s.approvedSum)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => open(a)}
                              className="inline-flex h-9 items-center gap-2 rounded-2xl bg-purple-700 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200"
                            >
                              <Send className="h-4 w-4" aria-hidden="true" />
                              Aportar
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
                <div className="text-sm font-bold text-slate-900">Sin actividades en curso</div>
                <div className="mt-1 text-sm text-slate-500">No hay actividades activas en este momento.</div>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">Actividades pasadas</div>
              <div className="text-xs font-semibold text-slate-500">{pastActivities.length}</div>
            </div>
            {pastActivities.length ? (
              <div className="mt-3 overflow-x-auto rounded-3xl ring-1 ring-purple-200/60">
                <table className="w-full min-w-[980px] border-separate border-spacing-0">
                  <thead className="bg-purple-50">
                    <tr className="text-left text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">Actividad</th>
                      <th className="px-4 py-3">Cuota</th>
                      <th className="px-4 py-3">Mi estado</th>
                      <th className="px-4 py-3">Mis aportes</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-200/40 bg-white">
                    {pastActivities.map((a) => {
                      const s = summaryByActivity.get(a.id) || { total: 0, approvedSum: 0 }
                      const st = statusForActivity(a.id)
                      return (
                        <tr key={a.id} className="text-sm text-slate-900">
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
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.pill}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-extrabold">{s.total}</span>
                            <span className="text-xs font-semibold text-slate-500"> · Aprobado: {formatCop(s.approvedSum)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => open(a)}
                              className="inline-flex h-9 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
                <div className="text-sm font-bold text-slate-900">Sin actividades pasadas</div>
                <div className="mt-1 text-sm text-slate-500">Aún no hay actividades cerradas.</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
          <div className="text-sm font-bold text-slate-900">Sin actividades</div>
          <div className="mt-1 text-sm text-slate-500">Aún no hay actividades creadas.</div>
        </div>
      )}

      <Modal
        open={Boolean(openActivity)}
        title={openActivity ? `${openActivity.title} · ${openActivity.category}` : 'Actividad'}
        onClose={() => {
          setOpenId('')
          setFiles([])
          setComment('')
          setError('')
        }}
      >
        {openActivity ? (
          <div className="grid gap-3">
            <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
              <div className="text-xs font-semibold text-purple-700">Cuota</div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">
                {openActivity.required_quantity} {openActivity.unit_label}
                {Number(openActivity.unit_amount || 0) > 0 ? ` · ${formatCop(openActivity.unit_amount)} c/u` : ''}
              </div>
              {openActivity.is_active === false ? <div className="mt-1 text-xs font-semibold text-slate-600">Actividad cerrada</div> : null}
            </div>

            <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-purple-200/60">
              <div className="text-xs font-semibold text-slate-500">Mis aportes</div>
              {myContribs.length ? (
                <div className="mt-2 overflow-x-auto rounded-2xl ring-1 ring-purple-200/60">
                  <table className="w-full min-w-[720px] border-collapse bg-white">
                    <thead className="bg-purple-50">
                      <tr className="text-left text-xs font-extrabold text-slate-700">
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Total</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2">Soporte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-200/40 text-sm text-slate-900">
                      {myContribs.map((c) => {
                        const whenValue = c?.paid_at || c?.created_at
                        const when = whenValue ? new Date(whenValue).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'
                        const supports = Array.isArray(c.support_paths) ? c.support_paths : []
                        const url = supports.length ? publicUrlFor(supports[0]) : ''
                        return (
                          <tr key={c.id}>
                            <td className="px-3 py-2 whitespace-nowrap">{when}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-extrabold">{formatCop(c.amount)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(c.status)}`}>
                                {c.status === 'approved' ? 'Aprobado' : c.status === 'pending' ? 'Pendiente' : c.status === 'rejected' ? 'Rechazado' : '—'}
                              </span>
                              {c.status === 'rejected' && c.decision_note ? (
                                <div className="mt-1 text-xs font-semibold text-pink-700">{c.decision_note}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
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
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-600">Aún no has reportado aportes.</div>
              )}
            </div>

            {openActivity.is_active !== false ? (
              <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-purple-200/60">
                <div className="text-sm font-extrabold text-slate-900">Nuevo aporte</div>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-slate-500">Cantidad</span>
                      <input
                        className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                        type="number"
                        min="1"
                        step="1"
                        value={quantity}
                        onChange={(e) => {
                          const next = e.target.value
                          setQuantity(next)
                          const unit = Number(openActivity.unit_amount || 0)
                          const qRaw = String(next ?? '').replace(/[^\d]/g, '')
                          const q = qRaw ? Number(qRaw) : 0
                          if (unit > 0 && Number.isFinite(q) && q >= 1) setAmount(String(unit * q))
                        }}
                        disabled={sending}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-slate-500">Valor</span>
                      <input
                        className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="50000"
                        disabled={sending || Number(openActivity.unit_amount || 0) > 0}
                      />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-slate-500">Fecha del aporte</span>
                    <input
                      className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                      type="datetime-local"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                      disabled={sending}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-slate-500">Comentarios</span>
                    <textarea
                      className="min-h-[90px] w-full resize-none rounded-xl border border-purple-200/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="(Opcional)"
                      disabled={sending}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-slate-500">Soporte (pantallazo)</span>
                    <input
                      className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-purple-100 file:px-5 file:py-2 file:text-sm file:font-extrabold file:text-purple-700 file:shadow-sm file:ring-1 file:ring-purple-200/60 hover:file:bg-purple-200"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                      disabled={sending}
                    />
                  </label>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={sending}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl bg-purple-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {sending ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
