import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
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

export default function SocioPrestamos() {
  const DEFAULT_INTEREST = 5
  const DEFAULT_MAX_PERCENT = 70

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState({ interestRate: DEFAULT_INTEREST, maxPercent: DEFAULT_MAX_PERCENT })
  const [totalAhorrado, setTotalAhorrado] = useState(0)
  const [loans, setLoans] = useState([])

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const maxPrestamo = useMemo(() => {
    const mp = Number(settings.maxPercent ?? DEFAULT_MAX_PERCENT)
    const pct = Number.isFinite(mp) ? mp : DEFAULT_MAX_PERCENT
    const base = Number(totalAhorrado || 0)
    return Math.floor((base * pct) / 100)
  }, [settings.maxPercent, totalAhorrado])

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

    const [{ data: settingsRow, error: settingsError }, { data: abonos, error: abonosError }, { data: myLoans, error: loansError }] =
      await Promise.all([
        supabase
          .from('loan_settings')
          .select('id, interest_rate_percent, max_loan_percent')
          .eq('id', 1)
          .maybeSingle(),
        supabase
          .from('abonos')
          .select('amount, status')
          .eq('user_id', userId)
          .eq('status', 'approved'),
        supabase
          .from('prestamos')
          .select('id, amount, interest_rate_percent, status, note, decision_note, created_at, decided_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ])

    if (settingsError) {
      const extra = [settingsError.code, settingsError.hint].filter(Boolean).join(' · ')
      setError(extra ? `${settingsError.message} (${extra})` : settingsError.message)
    }
    if (abonosError) {
      const extra = [abonosError.code, abonosError.hint].filter(Boolean).join(' · ')
      setError(extra ? `${abonosError.message} (${extra})` : abonosError.message)
    }
    if (loansError) {
      const extra = [loansError.code, loansError.hint].filter(Boolean).join(' · ')
      setError(extra ? `${loansError.message} (${extra})` : loansError.message)
    }

    const ir = Number(settingsRow?.interest_rate_percent ?? DEFAULT_INTEREST)
    const mp = Number(settingsRow?.max_loan_percent ?? DEFAULT_MAX_PERCENT)
    setSettings({
      interestRate: Number.isFinite(ir) ? ir : DEFAULT_INTEREST,
      maxPercent: Number.isFinite(mp) ? mp : DEFAULT_MAX_PERCENT,
    })

    const total = (abonos ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0)
    setTotalAhorrado(total)
    setLoans(myLoans ?? [])

    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(t)
  }, [load])

  async function submit() {
    setError('')
    const raw = String(amount ?? '').replace(/[^\d]/g, '')
    const numeric = raw ? Number(raw) : 0

    if (!numeric || numeric <= 0) {
      setError('Ingresa un valor válido')
      return
    }
    if (numeric > maxPrestamo) {
      setError(`El monto supera tu tope máximo (${formatCop(maxPrestamo)})`)
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

    const snapshotRateRaw = Number(settings.interestRate)
    const snapshotRate =
      Number.isFinite(snapshotRateRaw) && snapshotRateRaw > 0 ? snapshotRateRaw : DEFAULT_INTEREST

    setSaving(true)
    const payload = {
      user_id: sessionData.session.user.id,
      amount: numeric,
      interest_rate_percent: snapshotRate,
      status: 'pending',
      note: String(note ?? '').trim() || null,
      created_by: sessionData.session.user.id,
      created_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabase.from('prestamos').insert(payload)
    setSaving(false)

    if (insertError) {
      const extra = [insertError.code, insertError.hint].filter(Boolean).join(' · ')
      setError(extra ? `${insertError.message} (${extra})` : insertError.message)
      return
    }

    setAmount('')
    setNote('')
    await load()
  }

  const interestValue = useMemo(() => {
    const ir = Number(settings.interestRate ?? DEFAULT_INTEREST)
    const pct = Number.isFinite(ir) ? ir : DEFAULT_INTEREST
    const raw = String(amount ?? '').replace(/[^\d]/g, '')
    const numeric = raw ? Number(raw) : 0
    return numeric > 0 ? Math.floor((numeric * pct) / 100) : 0
  }, [amount, settings.interestRate])

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Solicitud de préstamos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Interés: {settings.interestRate}% · Tope: {settings.maxPercent}% de lo ahorrado.
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

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50 lg:col-span-2">
          <div className="text-sm font-bold text-slate-900">Tu capacidad</div>

          <div className="mt-3 grid gap-2">
            <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
              <div className="text-xs font-semibold text-purple-700">Total ahorrado (aprobado)</div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">{formatCop(totalAhorrado)}</div>
            </div>
            <div className="rounded-2xl bg-pink-50 px-3 py-2 ring-1 ring-pink-200/70">
              <div className="text-xs font-semibold text-pink-600">Tope máximo de préstamo</div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">{formatCop(maxPrestamo)}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-bold text-slate-900">Nueva solicitud</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Monto</span>
                <input
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="200000"
                  disabled={loading || saving}
                />
              </label>

              <div className="rounded-2xl border border-purple-200/60 bg-white px-3 py-2 text-sm text-slate-900">
                Interés estimado ({settings.interestRate}%): <span className="font-extrabold">{formatCop(interestValue)}</span>
              </div>

              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Nota</span>
                <textarea
                  className="min-h-[90px] w-full resize-none rounded-xl border border-purple-200/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="(Opcional)"
                  disabled={loading || saving}
                />
              </label>

              <button
                type="button"
                onClick={submit}
                disabled={loading || saving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50 lg:col-span-3">
          <div className="text-sm font-bold text-slate-900">Tus solicitudes</div>
          <div className="mt-1 text-sm text-slate-500">Historial de solicitudes y estado.</div>

          {loading ? (
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
              ))}
            </div>
          ) : loans.length ? (
            <div className="mt-4 grid gap-2">
              {loans.map((l) => {
                const createdAt = l.created_at
                  ? new Date(l.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                  : '—'
                const savedRate = Number(l.interest_rate_percent)
                const savedRateLabel = Number.isFinite(savedRate) && savedRate > 0 ? `${savedRate}%` : '—'
                return (
                  <div key={l.id} className="rounded-2xl border border-purple-200/50 bg-white px-3 py-3 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900">{formatCop(l.amount)}</div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          {createdAt} · Interés aplicado: {savedRateLabel}
                        </div>
                        {l.note ? <div className="mt-2 text-sm text-slate-700">{l.note}</div> : null}
                        {l.status === 'rejected' && l.decision_note ? (
                          <div className="mt-2 rounded-2xl bg-pink-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-pink-200/70">
                            <div className="text-xs font-semibold text-pink-600">Motivo del rechazo</div>
                            <div className="mt-1">{l.decision_note}</div>
                          </div>
                        ) : null}
                      </div>

                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(l.status)}`}>
                        {l.status === 'approved'
                          ? 'Aprobado'
                          : l.status === 'pending'
                          ? 'Pendiente'
                          : l.status === 'rejected'
                          ? 'Rechazado'
                          : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
              <div className="text-sm font-bold text-slate-900">Sin solicitudes</div>
              <div className="mt-1 text-sm text-slate-500">Aún no has solicitado un préstamo.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
