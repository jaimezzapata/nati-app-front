import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'

const copyBySection = {
  socios: {
    title: 'Gestionar Socios',
    description: 'Listado, creación y edición de socios. Roles y datos de contacto.',
  },
  abonos: {
    title: 'Gestionar Abonos',
    description: 'Registro de abonos, historial, pendientes y cierres.',
  },
  prestamos: {
    title: 'Gestionar Préstamos',
    description: 'Reglas del préstamo, solicitudes, aprobación/rechazo y seguimiento.',
  },
  actividades: {
    title: 'Gestionar Actividades',
    description: 'Eventos, turnos, reglas del ciclo y recordatorios.',
  },
}

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
              ×
            </button>
          </div>
          <div className="max-h-[calc(90vh-72px)] overflow-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

function AdminPrestamos({ title, description }) {
  const DEFAULT_INTEREST = 5
  const DEFAULT_MAX_PERCENT = 70

  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [interestRate, setInterestRate] = useState(DEFAULT_INTEREST)
  const [maxPercent, setMaxPercent] = useState(DEFAULT_MAX_PERCENT)
  const [savingSettings, setSavingSettings] = useState(false)

  const [loansLoading, setLoansLoading] = useState(true)
  const [loansError, setLoansError] = useState('')
  const [loans, setLoans] = useState([])
  const [profilesById, setProfilesById] = useState(() => new Map())
  const [statusFilter, setStatusFilter] = useState('pending')
  const [actingId, setActingId] = useState(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoan, setConfirmLoan] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmError, setConfirmError] = useState('')

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    setSettingsError('')

    const { data, error } = await supabase
      .from('loan_settings')
      .select('id, interest_rate_percent, max_loan_percent, updated_at, updated_by')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setSettingsError(extra ? `${error.message} (${extra})` : error.message)
      setInterestRate(DEFAULT_INTEREST)
      setMaxPercent(DEFAULT_MAX_PERCENT)
      setSettingsLoading(false)
      return
    }

    if (data) {
      const ir = Number(data.interest_rate_percent ?? DEFAULT_INTEREST)
      const mp = Number(data.max_loan_percent ?? DEFAULT_MAX_PERCENT)
      setInterestRate(Number.isFinite(ir) ? ir : DEFAULT_INTEREST)
      setMaxPercent(Number.isFinite(mp) ? mp : DEFAULT_MAX_PERCENT)
    } else {
      setInterestRate(DEFAULT_INTEREST)
      setMaxPercent(DEFAULT_MAX_PERCENT)
    }

    setSettingsLoading(false)
  }, [])

  const loadLoans = useCallback(async () => {
    setLoansLoading(true)
    setLoansError('')

    let q = supabase
      .from('prestamos')
      .select(
        'id, user_id, amount, interest_rate_percent, status, note, created_at, created_by, decided_at, decided_by, decision_note',
      )
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)

    const { data, error } = await q

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setLoansError(extra ? `${error.message} (${extra})` : error.message)
      setLoans([])
      setProfilesById(new Map())
      setLoansLoading(false)
      return
    }

    const list = data ?? []
    setLoans(list)

    const ids = Array.from(new Set(list.map((l) => l.user_id).filter(Boolean)))
    if (!ids.length) {
      setProfilesById(new Map())
      setLoansLoading(false)
      return
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone')
      .in('user_id', ids)

    if (profilesError) {
      setProfilesById(new Map())
      setLoansLoading(false)
      return
    }

    const m = new Map()
    for (const p of profiles ?? []) {
      m.set(p.user_id, p)
    }
    setProfilesById(m)
    setLoansLoading(false)
  }, [statusFilter])

  useEffect(() => {
    const t = setTimeout(() => {
      loadSettings()
      loadLoans()
    }, 0)
    return () => clearTimeout(t)
  }, [loadLoans, loadSettings])

  async function saveSettings() {
    setSettingsError('')
    const ir = Number(interestRate)
    const mp = Number(maxPercent)

    if (!Number.isFinite(ir) || ir <= 0) {
      setSettingsError('El % de interés debe ser mayor a 0')
      return
    }
    if (!Number.isFinite(mp) || mp <= 0 || mp > 100) {
      setSettingsError('El tope máximo debe ser un % entre 1 y 100')
      return
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setSettingsError(sessionError.message)
      return
    }
    if (!sessionData.session) {
      setSettingsError('No hay sesión activa')
      return
    }

    setSavingSettings(true)
    const payload = {
      id: 1,
      interest_rate_percent: ir,
      max_loan_percent: mp,
      updated_by: sessionData.session.user.id,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('loan_settings').upsert(payload, { onConflict: 'id' })
    setSavingSettings(false)

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setSettingsError(extra ? `${error.message} (${extra})` : error.message)
      return
    }

    await loadSettings()
  }

  function openConfirm(action, loan) {
    setConfirmError('')
    setConfirmAction(action)
    setConfirmLoan(loan ?? null)
    setConfirmNote('')
    setConfirmOpen(true)
  }

  async function decideLoan(id, nextStatus, decisionNote) {
    setLoansError('')
    if (!id) return
    if (nextStatus !== 'approved' && nextStatus !== 'rejected') return

    if (nextStatus === 'rejected') {
      const msg = String(decisionNote ?? '').trim()
      if (!msg) {
        setConfirmError('Escribe el motivo del rechazo')
        return
      }
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setLoansError(sessionError.message)
      return
    }
    if (!sessionData.session) {
      setLoansError('No hay sesión activa')
      return
    }

    setActingId(id)
    const payload = {
      status: nextStatus,
      decided_at: new Date().toISOString(),
      decided_by: sessionData.session.user.id,
      decision_note: String(decisionNote ?? '').trim() || null,
    }
    const { error } = await supabase.from('prestamos').update(payload).eq('id', id)
    setActingId(null)

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setLoansError(extra ? `${error.message} (${extra})` : error.message)
      return
    }

    await loadLoans()
  }

  async function confirmDecision() {
    if (!confirmLoan?.id || !confirmAction) return
    setConfirmError('')
    await decideLoan(confirmLoan.id, confirmAction, confirmNote)
    setConfirmOpen(false)
    setConfirmLoan(null)
    setConfirmAction(null)
    setConfirmNote('')
  }

  const totals = useMemo(() => {
    const pending = loans.filter((l) => l.status === 'pending').length
    const approved = loans.filter((l) => l.status === 'approved').length
    const rejected = loans.filter((l) => l.status === 'rejected').length
    return { pending, approved, rejected }
  }, [loans])

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50 lg:col-span-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Reglas del préstamo</div>
              <div className="mt-1 text-sm text-slate-500">
                Por defecto: {DEFAULT_INTEREST}% interés y {DEFAULT_MAX_PERCENT}% del total ahorrado.
              </div>
            </div>
            <button
              type="button"
              onClick={loadSettings}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              aria-label="Actualizar reglas"
              title="Actualizar"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {settingsError ? (
            <div className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
              {settingsError}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">% interés</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                inputMode="decimal"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                disabled={settingsLoading || savingSettings}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Tope máximo (% de lo ahorrado)</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                inputMode="decimal"
                value={maxPercent}
                onChange={(e) => setMaxPercent(e.target.value)}
                disabled={settingsLoading || savingSettings}
              />
            </label>

            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsLoading || savingSettings}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {savingSettings ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Solicitudes</div>
              <div className="mt-1 text-sm text-slate-500">
                Pendientes: {totals.pending} · Aprobadas: {totals.approved} · Rechazadas: {totals.rejected}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:ring-4 focus:ring-purple-200"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobadas</option>
                <option value="rejected">Rechazadas</option>
                <option value="all">Todas</option>
              </select>
              <button
                type="button"
                onClick={loadLoans}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                aria-label="Actualizar solicitudes"
                title="Actualizar"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {loansError ? (
            <div className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
              {loansError}
            </div>
          ) : null}

          {loansLoading ? (
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
              ))}
            </div>
          ) : loans.length ? (
            <div className="mt-4 grid gap-2">
              {loans.map((l) => {
                const p = profilesById.get(l.user_id)
                const name = p?.full_name || 'Socio'
                const phone = p?.phone || '—'
                const createdAt = l.created_at
                  ? new Date(l.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                  : '—'
                const savedRate = Number(l.interest_rate_percent)
                const savedRateLabel = Number.isFinite(savedRate) && savedRate > 0 ? `${savedRate}%` : '—'

                return (
                  <div
                    key={l.id}
                    className="rounded-2xl border border-purple-200/50 bg-white px-3 py-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-slate-900">
                          {name} · {phone}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          {createdAt} · Interés aplicado: {savedRateLabel}
                        </div>
                        {l.note ? <div className="mt-2 text-sm text-slate-700">{l.note}</div> : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-sm font-extrabold text-slate-900">{formatCop(l.amount)}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(l.status)}`}
                        >
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

                    {l.status === 'pending' ? (
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={actingId === l.id}
                          onClick={() => openConfirm('rejected', l)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                          Rechazar
                        </button>
                        <button
                          type="button"
                          disabled={actingId === l.id}
                          onClick={() => openConfirm('approved', l)}
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
              <div className="text-sm font-bold text-slate-900">Sin solicitudes</div>
              <div className="mt-1 text-sm text-slate-500">Aún no hay préstamos para mostrar con ese filtro.</div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        title={confirmAction === 'rejected' ? 'Confirmar rechazo' : 'Confirmar aprobación'}
        onClose={() => {
          setConfirmOpen(false)
          setConfirmLoan(null)
          setConfirmAction(null)
          setConfirmNote('')
          setConfirmError('')
        }}
      >
        <div className="grid gap-4">
          <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-purple-700">Solicitud</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {confirmLoan?.amount ? formatCop(confirmLoan.amount) : '—'}
            </div>
          </div>

          {confirmAction === 'rejected' ? (
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Motivo del rechazo</span>
              <textarea
                className="min-h-[110px] w-full resize-none rounded-xl border border-purple-200/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                placeholder="Ej: No cumples el porcentaje mínimo de ahorro, historial pendiente, etc."
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
              onClick={() => {
                setConfirmOpen(false)
                setConfirmLoan(null)
                setConfirmAction(null)
                setConfirmNote('')
                setConfirmError('')
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={actingId === confirmLoan?.id}
              className={[
                'inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60',
                confirmAction === 'rejected' ? 'bg-pink-600 hover:bg-pink-500 disabled:hover:bg-pink-600' : 'bg-purple-700 hover:bg-purple-500 disabled:hover:bg-purple-700',
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

export default function AdminSection({ section }) {
  const copy = useMemo(() => copyBySection[section] ?? null, [section])

  if (!copy) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
        <div className="text-sm font-bold text-slate-900">
          Sección no encontrada
        </div>
        <div className="mt-2 text-sm text-slate-500">
          Esta opción aún no está disponible.
        </div>
      </div>
    )
  }

  if (section === 'prestamos') return <AdminPrestamos title={copy.title} description={copy.description} />

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{copy.description}</p>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
        <div className="text-sm font-bold text-slate-900">En construcción</div>
        <div className="mt-2 text-sm text-slate-500">
          Aquí montamos la interfaz completa con filtros, tabla y acciones.
        </div>
      </div>

      <div className="mt-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
        <div className="text-sm font-bold text-slate-900">Diseño</div>
        <div className="mt-2 text-sm text-slate-500">
          Mantendremos un estilo minimalista: jerarquía clara, espacios amplios, foco en
          acciones y microinteracciones.
        </div>
      </div>
    </div>
  )
}
