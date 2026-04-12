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

export default function SocioActividades() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activities, setActivities] = useState([])
  const [latestByActivity, setLatestByActivity] = useState(() => new Map())

  const [openId, setOpenId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [paidAt, setPaidAt] = useState(toDatetimeLocal(new Date().toISOString()))
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)

  const openActivity = useMemo(() => activities.find((a) => a.id === openId) ?? null, [activities, openId])
  const existing = useMemo(() => (openId ? latestByActivity.get(openId) ?? null : null), [latestByActivity, openId])

  const canSend = useMemo(() => {
    if (!openId) return false
    if (!existing) return true
    if (existing.status === 'rejected') return true
    return false
  }, [existing, openId])

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
        .eq('is_active', true)
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
      setLatestByActivity(new Map())
      setLoading(false)
      return
    }

    if (contribRes.error) {
      const extra = [contribRes.error.code, contribRes.error.hint].filter(Boolean).join(' · ')
      setError(extra ? `${contribRes.error.message} (${extra})` : contribRes.error.message)
      setActivities(actRes.data ?? [])
      setLatestByActivity(new Map())
      setLoading(false)
      return
    }

    const acts = actRes.data ?? []
    setActivities(acts)

    const map = new Map()
    for (const c of contribRes.data ?? []) {
      if (!c.activity_id) continue
      if (!map.has(c.activity_id)) map.set(c.activity_id, c)
    }
    setLatestByActivity(map)
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
    const latest = latestByActivity.get(a.id) ?? null
    setQuantity(String(latest?.quantity ?? a.required_quantity ?? 1))
    const unit = Number(a.unit_amount || 0)
    const q = Number(latest?.quantity ?? a.required_quantity ?? 1)
    const suggested = unit > 0 ? unit * q : Number(latest?.amount || 0)
    setAmount(suggested ? String(suggested) : '')
    setComment('')
    setPaidAt(toDatetimeLocal(new Date().toISOString()))
    setFiles([])
  }

  async function submit() {
    setError('')
    if (!openActivity) return
    if (!canSend) {
      setError('Esta actividad ya está Pendiente o Aprobada. Solo puedes re-enviar si fue Rechazada.')
      return
    }

    const q = Number(String(quantity ?? '').replace(/[^\d]/g, ''))
    if (!q || q <= 0) {
      setError('Ingresa una cantidad válida')
      return
    }

    const raw = String(amount ?? '').replace(/[^\d]/g, '')
    const numeric = raw ? Number(raw) : 0
    if (!numeric || numeric <= 0) {
      setError('Ingresa un valor válido')
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

    const userId = sessionData.session.user.id
    const paidIso = datetimeLocalToIso(paidAt) || new Date().toISOString()
    const unitSnapshot = Number(openActivity.unit_amount || 0)

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
        if (insErr.code === '23505') {
          throw new Error('Ya existe una solicitud pendiente/aprobada para esta actividad.')
        }
        throw insErr
      }

      setSending(false)
      setOpenId('')
      await load()
    } catch (e) {
      setSending(false)
      setError(String(e?.message ?? e))
    }
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

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
          ))}
        </div>
      ) : activities.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {activities.map((a) => {
            const latest = latestByActivity.get(a.id) ?? null
            const locked = latest?.status && latest.status !== 'rejected'
            const urls = Array.isArray(latest?.support_paths)
              ? latest.support_paths.map((p) => publicUrlFor(p)).filter(Boolean)
              : []
            return (
              <div key={a.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-slate-900">{a.title}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {a.category} · {a.required_quantity} {a.unit_label}
                      {Number(a.unit_amount || 0) > 0 ? ` · ${formatCop(a.unit_amount)} c/u` : ''}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(latest?.status)}`}>
                    {latest?.status === 'approved'
                      ? 'Aprobado'
                      : latest?.status === 'pending'
                      ? 'Pendiente'
                      : latest?.status === 'rejected'
                      ? 'Rechazado'
                      : 'Sin enviar'}
                  </span>
                </div>

                {latest?.status === 'rejected' && latest.decision_note ? (
                  <div className="mt-3 rounded-2xl bg-pink-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-pink-200/70">
                    <div className="text-xs font-semibold text-pink-600">Motivo del rechazo</div>
                    <div className="mt-1">{latest.decision_note}</div>
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

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => open(a)}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl bg-purple-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {locked ? 'Ver' : latest ? 'Re-enviar' : 'Enviar'}
                  </button>
                </div>

                {openId === a.id ? (
                  <div className="mt-4 grid gap-3 rounded-3xl bg-purple-50 p-4 ring-1 ring-purple-200/60">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-xs font-semibold text-slate-500">Cantidad</span>
                        <input
                          className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                          inputMode="numeric"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          disabled={sending || locked}
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
                          disabled={sending || locked}
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
                        disabled={sending || locked}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-slate-500">Comentarios</span>
                      <textarea
                        className="min-h-[90px] w-full resize-none rounded-xl border border-purple-200/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="(Opcional)"
                        disabled={sending || locked}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-slate-500">Soporte (pantallazo)</span>
                      <input
                        className="block w-full text-sm text-slate-900 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900 file:shadow-sm file:ring-1 file:ring-purple-200/60"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                        disabled={sending || locked}
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setOpenId('')}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={submit}
                        disabled={sending || locked}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl bg-purple-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        {sending ? 'Enviando…' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
          <div className="text-sm font-bold text-slate-900">Sin actividades</div>
          <div className="mt-1 text-sm text-slate-500">Aún no hay actividades activas.</div>
        </div>
      )}
    </div>
  )
}
