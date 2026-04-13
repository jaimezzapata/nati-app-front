import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'

const BUCKET = import.meta.env.VITE_STORAGE_BUCKET || 'nati-app'

function publicUrlFor(path) {
  try {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return ''
  }
}

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
  intereses: {
    title: 'Ganancia por Intereses',
    description: 'Intereses acumulados de préstamos para liquidación final de socios.',
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
  const DEFAULT_MAX_LOANS_PER_CYCLE = 5
  const DEFAULT_MAX_ACTIVE_LOANS = 2

  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [interestRate, setInterestRate] = useState(DEFAULT_INTEREST)
  const [maxPercent, setMaxPercent] = useState(DEFAULT_MAX_PERCENT)
  const [maxLoansPerCycle, setMaxLoansPerCycle] = useState(DEFAULT_MAX_LOANS_PER_CYCLE)
  const [maxActiveLoans, setMaxActiveLoans] = useState(DEFAULT_MAX_ACTIVE_LOANS)
  const [savingSettings, setSavingSettings] = useState(false)

  const [loansLoading, setLoansLoading] = useState(true)
  const [loansError, setLoansError] = useState('')
  const [loans, setLoans] = useState([])
  const [profilesById, setProfilesById] = useState(() => new Map())
  const [actingId, setActingId] = useState(null)

  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [paymentsError, setPaymentsError] = useState('')
  const [payments, setPayments] = useState([])
  const [actingPaymentId, setActingPaymentId] = useState(null)

  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all') // all | solicitudes | pagos | aprobados

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoan, setConfirmLoan] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmError, setConfirmError] = useState('')

  const [confirmPayOpen, setConfirmPayOpen] = useState(false)
  const [confirmPay, setConfirmPay] = useState(null)
  const [confirmPayAction, setConfirmPayAction] = useState(null)
  const [confirmPayNote, setConfirmPayNote] = useState('')
  const [confirmPayError, setConfirmPayError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [payViewOpen, setPayViewOpen] = useState(false)
  const [payView, setPayView] = useState(null)

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    setSettingsError('')

    let { data, error } = await supabase
      .from('loan_settings')
      .select('id, interest_rate_percent, max_loan_percent, max_loans_per_cycle, max_active_loans, updated_at, updated_by')
      .eq('id', 1)
      .maybeSingle()

    if (error?.code === '42703') {
      const retry = await supabase
        .from('loan_settings')
        .select('id, interest_rate_percent, max_loan_percent, updated_at, updated_by')
        .eq('id', 1)
        .maybeSingle()
      data = retry.data
      error = retry.error
    }

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setSettingsError(extra ? `${error.message} (${extra})` : error.message)
      setInterestRate(DEFAULT_INTEREST)
      setMaxPercent(DEFAULT_MAX_PERCENT)
      setMaxLoansPerCycle(DEFAULT_MAX_LOANS_PER_CYCLE)
      setMaxActiveLoans(DEFAULT_MAX_ACTIVE_LOANS)
      setSettingsLoading(false)
      return
    }

    if (data) {
      const ir = Number(data.interest_rate_percent ?? DEFAULT_INTEREST)
      const mp = Number(data.max_loan_percent ?? DEFAULT_MAX_PERCENT)
      const ml = Number(data.max_loans_per_cycle ?? DEFAULT_MAX_LOANS_PER_CYCLE)
      const ma = Number(data.max_active_loans ?? DEFAULT_MAX_ACTIVE_LOANS)
      setInterestRate(Number.isFinite(ir) ? ir : DEFAULT_INTEREST)
      setMaxPercent(Number.isFinite(mp) ? mp : DEFAULT_MAX_PERCENT)
      setMaxLoansPerCycle(Number.isFinite(ml) ? ml : DEFAULT_MAX_LOANS_PER_CYCLE)
      setMaxActiveLoans(Number.isFinite(ma) ? ma : DEFAULT_MAX_ACTIVE_LOANS)
    } else {
      setInterestRate(DEFAULT_INTEREST)
      setMaxPercent(DEFAULT_MAX_PERCENT)
      setMaxLoansPerCycle(DEFAULT_MAX_LOANS_PER_CYCLE)
      setMaxActiveLoans(DEFAULT_MAX_ACTIVE_LOANS)
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

    const { data, error } = await q

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setLoansError(extra ? `${error.message} (${extra})` : error.message)
      setLoans([])
      setLoansLoading(false)
      return
    }

    const list = data ?? []
    setLoans(list)

    const ids = Array.from(new Set(list.map((l) => l.user_id).filter(Boolean)))
    if (!ids.length) {
      setLoansLoading(false)
      return
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone')
      .in('user_id', ids)

    if (profilesError) {
      setLoansLoading(false)
      return
    }

    setProfilesById((prev) => {
      const m = new Map(prev)
      for (const p of profiles ?? []) {
        m.set(p.user_id, p)
      }
      return m
    })
    setLoansLoading(false)
  }, [])

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true)
    setPaymentsError('')

    let q = supabase
      .from('prestamo_pagos')
      .select(
        'id, prestamo_id, socio_id, tipo, monto, capital_monto, interes_monto, fecha_pago, mes_correspondiente, comprobante_url, estado, comentarios, created_at',
      )
      .order('created_at', { ascending: false })

    const { data, error } = await q
    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setPaymentsError(extra ? `${error.message} (${extra})` : error.message)
      setPayments([])
      setPaymentsLoading(false)
      return
    }

    const list = data ?? []
    setPayments(list)

    const ids = Array.from(new Set(list.map((p) => p.socio_id).filter(Boolean)))
    if (!ids.length) {
      setPaymentsLoading(false)
      return
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone')
      .in('user_id', ids)

    if (!profilesError) {
      setProfilesById((prev) => {
        const m = new Map(prev)
        for (const p of profiles ?? []) {
          m.set(p.user_id, p)
        }
        return m
      })
    }

    setPaymentsLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      loadSettings()
      loadLoans()
      loadPayments()
    }, 0)
    return () => clearTimeout(t)
  }, [loadLoans, loadPayments, loadSettings])

  async function saveSettings() {
    setSettingsError('')
    const ir = Number(interestRate)
    const mp = Number(maxPercent)
    const ml = Number(maxLoansPerCycle)
    const ma = Number(maxActiveLoans)

    if (!Number.isFinite(ir) || ir <= 0) {
      setSettingsError('El % de interés debe ser mayor a 0')
      return
    }
    if (!Number.isFinite(mp) || mp <= 0) {
      setSettingsError('El tope máximo debe ser mayor a 0')
      return
    }
    if (!Number.isFinite(ml) || ml <= 0 || !Number.isInteger(ml)) {
      setSettingsError('El máximo de préstamos por ciclo debe ser un entero mayor a 0')
      return
    }
    if (!Number.isFinite(ma) || ma <= 0 || !Number.isInteger(ma)) {
      setSettingsError('El máximo de préstamos activos debe ser un entero mayor a 0')
      return
    }
    if (ma > ml) {
      setSettingsError('El máximo de préstamos activos no puede ser mayor al máximo por ciclo')
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
      max_loans_per_cycle: ml,
      max_active_loans: ma,
      updated_by: sessionData.session.user.id,
      updated_at: new Date().toISOString(),
    }

    let { error } = await supabase.from('loan_settings').upsert(payload, { onConflict: 'id' })
    if (error?.code === '42703') {
      const fallbackPayload = {
        id: 1,
        interest_rate_percent: ir,
        max_loan_percent: mp,
        updated_by: sessionData.session.user.id,
        updated_at: new Date().toISOString(),
      }
      const retry = await supabase.from('loan_settings').upsert(fallbackPayload, { onConflict: 'id' })
      error = retry.error
    }
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

  function openConfirmPay(action, pay) {
    setConfirmPayError('')
    setConfirmPayAction(action)
    setConfirmPay(pay ?? null)
    setConfirmPayNote('')
    setConfirmPayOpen(true)
  }

  function openPayView(pay) {
    setPayView(pay ?? null)
    setPayViewOpen(true)
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

  async function decidePayment(id, nextStatus, decisionNote) {
    setPaymentsError('')
    if (!id) return
    if (nextStatus !== 'approved' && nextStatus !== 'rejected') return

    if (nextStatus === 'rejected') {
      const msg = String(decisionNote ?? '').trim()
      if (!msg) {
        setConfirmPayError('Escribe el motivo del rechazo')
        return
      }
    }

    setActingPaymentId(id)
    const payload = {
      estado: nextStatus,
      comentarios: String(decisionNote ?? '').trim() || null,
    }
    const { error } = await supabase.from('prestamo_pagos').update(payload).eq('id', id)
    setActingPaymentId(null)

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setPaymentsError(extra ? `${error.message} (${extra})` : error.message)
      return
    }

    await loadPayments()
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

  async function confirmPayDecision() {
    if (!confirmPay?.id || !confirmPayAction) return
    setConfirmPayError('')
    await decidePayment(confirmPay.id, confirmPayAction, confirmPayNote)
    setConfirmPayOpen(false)
    setConfirmPay(null)
    setConfirmPayAction(null)
    setConfirmPayNote('')
  }

  const filteredLoans = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return loans
    return loans.filter((l) => {
      const p = profilesById.get(l.user_id)
      const name = String(p?.full_name || '').toLowerCase()
      const phone = String(p?.phone || '').toLowerCase()
      const note = String(l.note || '').toLowerCase()
      return name.includes(q) || phone.includes(q) || note.includes(q)
    })
  }, [loans, profilesById, query])

  const loanCounts = useMemo(() => {
    let pending = 0
    let approved = 0
    let rejected = 0
    for (const l of filteredLoans) {
      if (l.status === 'pending') pending += 1
      else if (l.status === 'approved') approved += 1
      else if (l.status === 'rejected') rejected += 1
    }
    return { all: filteredLoans.length, pending, approved, rejected }
  }, [filteredLoans])

  const loansByStatus = useMemo(() => {
    const pending = []
    const approved = []
    const rejected = []
    for (const l of filteredLoans) {
      if (l.status === 'pending') pending.push(l)
      else if (l.status === 'approved') approved.push(l)
      else if (l.status === 'rejected') rejected.push(l)
    }
    return { pending, approved, rejected }
  }, [filteredLoans])

  const filteredPayments = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return payments
    return payments.filter((pmt) => {
      const p = profilesById.get(pmt.socio_id)
      const name = String(p?.full_name || '').toLowerCase()
      const phone = String(p?.phone || '').toLowerCase()
      const month = String(pmt.mes_correspondiente || '').toLowerCase()
      const comments = String(pmt.comentarios || '').toLowerCase()
      return name.includes(q) || phone.includes(q) || month.includes(q) || comments.includes(q)
    })
  }, [payments, profilesById, query])

  const paymentCounts = useMemo(() => {
    let pending = 0
    let approved = 0
    let rejected = 0
    for (const p of filteredPayments) {
      if (p.estado === 'pending') pending += 1
      else if (p.estado === 'approved') approved += 1
      else if (p.estado === 'rejected') rejected += 1
    }
    return { all: filteredPayments.length, pending, approved, rejected }
  }, [filteredPayments])

  const paidCapitalByLoanId = useMemo(() => {
    const m = new Map()
    for (const p of payments) {
      if (p.estado !== 'approved') continue
      if (!p.prestamo_id) continue
      const cap = Number(p.capital_monto ?? (p.tipo === 'total' || p.tipo === 'capital' ? p.monto : 0))
      const prev = m.get(p.prestamo_id) || 0
      m.set(p.prestamo_id, prev + (Number.isFinite(cap) ? cap : 0))
    }
    return m
  }, [payments])

  const liquidatedLoanIds = useMemo(() => {
    const s = new Set()
    for (const l of loans) {
      if (l.status !== 'approved') continue
      const paid = paidCapitalByLoanId.get(l.id) || 0
      const principal = Number(l.amount)
      if (Number.isFinite(principal) && paid >= principal) s.add(l.id)
    }
    return s
  }, [loans, paidCapitalByLoanId])

  const loansForTable = useMemo(() => {
    if (tab === 'solicitudes') return loansByStatus.pending
    if (tab === 'aprobados') return loansByStatus.approved
    return filteredLoans
  }, [filteredLoans, loansByStatus, tab])

  const paymentsForTable = useMemo(() => {
    if (tab !== 'pagos') return []
    return filteredPayments
  }, [filteredPayments, tab])

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="grid gap-3">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900">Panel de préstamos</div>
              <div className="mt-1 text-sm text-slate-500">
                Interés: <span className="font-extrabold text-slate-900">{Number(interestRate) || DEFAULT_INTEREST}%</span> ·
                Tope: <span className="font-extrabold text-slate-900">{Number(maxPercent) || DEFAULT_MAX_PERCENT}%</span> ·
                Máx/ciclo: <span className="font-extrabold text-slate-900">{Number(maxLoansPerCycle) || DEFAULT_MAX_LOANS_PER_CYCLE}</span> ·
                Máx activos: <span className="font-extrabold text-slate-900">{Number(maxActiveLoans) || DEFAULT_MAX_ACTIVE_LOANS}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSettingsError('')
                  setRulesOpen(true)
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200"
              >
                Reglas del préstamo
              </button>
              <button
                type="button"
                onClick={() => {
                  loadSettings()
                  loadLoans()
                  loadPayments()
                }}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                aria-label="Actualizar"
                title="Actualizar"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'solicitudes', label: 'Solicitudes' },
                { id: 'pagos', label: 'Pagos reportados' },
                { id: 'aprobados', label: 'Aprobados' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={[
                    'inline-flex h-10 items-center justify-center rounded-2xl px-3 text-sm font-extrabold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                    tab === t.id
                      ? 'bg-purple-700 text-white hover:bg-purple-500'
                      : 'border border-purple-200/60 bg-white text-slate-900 hover:bg-purple-50',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <input
              className="h-10 w-full max-w-xs rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-purple-200"
              placeholder="Buscar (nombre/teléfono/mes)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900">
                {tab === 'pagos' ? 'Pagos reportados' : tab === 'solicitudes' ? 'Solicitudes' : tab === 'aprobados' ? 'Aprobados' : 'Todos'}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {tab === 'pagos'
                  ? `Pendientes: ${paymentCounts.pending} · Aprobados: ${paymentCounts.approved} · Rechazados: ${paymentCounts.rejected} · Total: ${paymentCounts.all}`
                  : tab === 'solicitudes'
                  ? `Pendientes: ${loansForTable.length} · Total: ${loanCounts.all}`
                  : tab === 'aprobados'
                  ? `Aprobados: ${loansForTable.length} · Liquidados: ${loansForTable.filter((l) => liquidatedLoanIds.has(l.id)).length}`
                  : `Pendientes: ${loanCounts.pending} · Aprobadas: ${loanCounts.approved} · Rechazadas: ${loanCounts.rejected} · Total: ${loanCounts.all}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (tab === 'pagos') loadPayments()
                else loadLoans()
              }}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              aria-label="Actualizar"
              title="Actualizar"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {tab === 'pagos' ? (
            paymentsError ? (
              <div className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">{paymentsError}</div>
            ) : null
          ) : loansError ? (
            <div className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">{loansError}</div>
          ) : null}

          {tab === 'pagos' ? (
            paymentsLoading ? (
              <div className="mt-4 grid gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
                ))}
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-3xl ring-1 ring-purple-200/60">
                <table className="w-full min-w-[1060px] border-separate border-spacing-0">
                  <thead className="bg-purple-50">
                    <tr className="text-left text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Socio</th>
                      <th className="px-4 py-3">Teléfono</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Mes</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Capital</th>
                      <th className="px-4 py-3">Interés</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Comprobante</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-200/40 bg-white">
                    {paymentsForTable.length ? (
                      paymentsForTable.map((p) => {
                        const profile = profilesById.get(p.socio_id)
                        const name = profile?.full_name || 'Socio'
                        const phone = profile?.phone || '—'
                        const paidAt = p.fecha_pago
                          ? new Date(p.fecha_pago).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                          : p.created_at
                          ? new Date(p.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'
                        const receiptUrl = p.comprobante_url ? publicUrlFor(p.comprobante_url) : ''

                        return (
                          <tr key={p.id} className="text-sm text-slate-900">
                            <td className="px-4 py-3 whitespace-nowrap">{paidAt}</td>
                            <td className="px-4 py-3">{name}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{phone}</td>
                            <td className="px-4 py-3">
                              {p.tipo === 'interes'
                                ? 'Interés'
                                : p.tipo === 'total'
                                ? 'Total'
                                : p.tipo === 'capital'
                                ? 'Capital'
                                : 'Pago'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{p.mes_correspondiente || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-extrabold">{formatCop(p.monto)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{formatCop(p.capital_monto ?? 0)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{formatCop(p.interes_monto ?? 0)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(p.estado)}`}>
                                {p.estado === 'approved' ? 'Aprobado' : p.estado === 'pending' ? 'Pendiente' : 'Rechazado'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {receiptUrl ? (
                                <a
                                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                                  href={receiptUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver
                                </a>
                              ) : (
                                <span className="text-xs font-semibold text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {p.estado === 'pending' ? (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={actingPaymentId === p.id}
                                    onClick={() => openConfirmPay('rejected', p)}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                                  >
                                    Rechazar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actingPaymentId === p.id}
                                    onClick={() => openConfirmPay('approved', p)}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
                                  >
                                    Aprobar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openPayView(p)}
                                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                                >
                                  Ver
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={11} className="px-4 py-6 text-sm font-semibold text-slate-600">
                          Sin registros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          ) : loansLoading ? (
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
              ))}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-3xl ring-1 ring-purple-200/60">
              <table className="w-full min-w-[1100px] border-separate border-spacing-0">
                <thead className="bg-purple-50">
                  <tr className="text-left text-xs font-extrabold text-slate-700">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Socio</th>
                    <th className="px-4 py-3">Teléfono</th>
                    <th className="px-4 py-3">Monto</th>
                    <th className="px-4 py-3">Interés</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Liquidado</th>
                    <th className="px-4 py-3">Nota</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-200/40 bg-white">
                  {loansForTable.length ? (
                    loansForTable.map((l) => {
                      const p = profilesById.get(l.user_id)
                      const name = p?.full_name || 'Socio'
                      const phone = p?.phone || '—'
                      const createdAt = l.created_at
                        ? new Date(l.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'
                      const savedRate = Number(l.interest_rate_percent)
                      const savedRateLabel = Number.isFinite(savedRate) && savedRate > 0 ? `${savedRate}%` : '—'
                      const liquidado = liquidatedLoanIds.has(l.id)

                      return (
                        <tr key={l.id} className="text-sm text-slate-900">
                          <td className="px-4 py-3 whitespace-nowrap">{createdAt}</td>
                          <td className="px-4 py-3">{name}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{phone}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-extrabold">{formatCop(l.amount)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{savedRateLabel}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(l.status)}`}>
                              {l.status === 'approved' ? 'Aprobado' : l.status === 'pending' ? 'Pendiente' : l.status === 'rejected' ? 'Rechazado' : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {liquidado ? (
                              <span className="inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-purple-200/70">
                                Sí
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[420px]">
                            <div className="truncate text-sm text-slate-700">{l.note || l.decision_note || '—'}</div>
                          </td>
                          <td className="px-4 py-3">
                            {l.status === 'pending' ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={actingId === l.id}
                                  onClick={() => openConfirm('rejected', l)}
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                                >
                                  Rechazar
                                </button>
                                <button
                                  type="button"
                                  disabled={actingId === l.id}
                                  onClick={() => openConfirm('approved', l)}
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
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
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-sm font-semibold text-slate-600">
                        Sin registros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={rulesOpen}
        title="Reglas del préstamo"
        onClose={() => {
          setRulesOpen(false)
          setSettingsError('')
        }}
      >
        <div className="grid gap-4">
          <div className="text-sm text-slate-500">
            Por defecto: {DEFAULT_INTEREST}% interés y {DEFAULT_MAX_PERCENT}% del total ahorrado.
          </div>

          {settingsError ? (
            <div className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">{settingsError}</div>
          ) : null}

          <div className="grid gap-3">
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

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Máximo de préstamos por ciclo</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                inputMode="numeric"
                value={maxLoansPerCycle}
                onChange={(e) => setMaxLoansPerCycle(e.target.value)}
                disabled={settingsLoading || savingSettings}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Máximo de préstamos activos simultáneos</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
                inputMode="numeric"
                value={maxActiveLoans}
                onChange={(e) => setMaxActiveLoans(e.target.value)}
                disabled={settingsLoading || savingSettings}
              />
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  loadSettings()
                }}
                disabled={settingsLoading || savingSettings}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Recargar
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={settingsLoading || savingSettings}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {savingSettings ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={payViewOpen}
        title="Detalle del pago"
        onClose={() => {
          setPayViewOpen(false)
          setPayView(null)
        }}
      >
        <div className="grid gap-3">
          <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-purple-700">Estado</div>
            <div className="mt-1">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(payView?.estado)}`}>
                {payView?.estado === 'approved' ? 'Aprobado' : payView?.estado === 'pending' ? 'Pendiente' : payView?.estado === 'rejected' ? 'Rechazado' : '—'}
              </span>
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-slate-500">Socio</div>
            <div className="text-sm font-extrabold text-slate-900">
              {(profilesById.get(payView?.socio_id)?.full_name || 'Socio') + ' · ' + (profilesById.get(payView?.socio_id)?.phone || '—')}
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {(payView?.fecha_pago
                ? new Date(payView.fecha_pago).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                : payView?.created_at
                ? new Date(payView.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                : '—') +
                ' · ' +
                (payView?.tipo === 'interes'
                  ? `Interés${payView?.mes_correspondiente ? ` (${payView.mes_correspondiente})` : ''}`
                  : payView?.tipo === 'total'
                  ? 'Pago total'
                  : payView?.tipo === 'capital'
                  ? 'Capital'
                  : 'Pago')}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-slate-500">Montos</div>
            <div className="text-sm font-extrabold text-slate-900">Total: {formatCop(payView?.monto ?? 0)}</div>
            <div className="text-xs font-semibold text-slate-500">
              Capital: {formatCop(payView?.capital_monto ?? 0)} · Interés: {formatCop(payView?.interes_monto ?? 0)}
            </div>
          </div>

          {payView?.comentarios ? (
            <div className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-purple-200/60">{payView.comentarios}</div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {payView?.comprobante_url ? (
              <a
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                href={publicUrlFor(payView.comprobante_url)}
                target="_blank"
                rel="noreferrer"
              >
                Ver comprobante
              </a>
            ) : null}
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-purple-700 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => {
                setPayViewOpen(false)
                setPayView(null)
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

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

      <Modal
        open={confirmPayOpen}
        title={confirmPayAction === 'rejected' ? 'Confirmar rechazo' : 'Confirmar aprobación'}
        onClose={() => {
          setConfirmPayOpen(false)
          setConfirmPay(null)
          setConfirmPayAction(null)
          setConfirmPayNote('')
          setConfirmPayError('')
        }}
      >
        <div className="grid gap-4">
          <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-purple-700">Pago</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {confirmPay?.monto ? formatCop(confirmPay.monto) : '—'}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {confirmPay?.tipo === 'interes'
                ? `Interés${confirmPay?.mes_correspondiente ? ` (${confirmPay.mes_correspondiente})` : ''}`
                : confirmPay?.tipo === 'total'
                ? 'Pago total (liquidación)'
                : 'Pago'}
            </div>
          </div>

          {confirmPayAction === 'rejected' ? (
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Motivo del rechazo</span>
              <textarea
                className="min-h-[110px] w-full resize-none rounded-xl border border-purple-200/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={confirmPayNote}
                onChange={(e) => setConfirmPayNote(e.target.value)}
                placeholder="Ej: comprobante ilegible, monto incorrecto, mes no corresponde, etc."
              />
            </label>
          ) : null}

          {confirmPayError ? (
            <div role="alert" className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900">
              {confirmPayError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => {
                setConfirmPayOpen(false)
                setConfirmPay(null)
                setConfirmPayAction(null)
                setConfirmPayNote('')
                setConfirmPayError('')
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={actingPaymentId === confirmPay?.id}
              className={[
                'inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60',
                confirmPayAction === 'rejected'
                  ? 'bg-pink-600 hover:bg-pink-500 disabled:hover:bg-pink-600'
                  : 'bg-purple-700 hover:bg-purple-500 disabled:hover:bg-purple-700',
              ].join(' ')}
              onClick={confirmPayDecision}
            >
              {confirmPayAction === 'rejected' ? 'Rechazar' : 'Aprobar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function AdminIntereses({ title, description }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState('')
  const [members, setMembers] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [paymentsError, setPaymentsError] = useState('')
  const [payments, setPayments] = useState([])
  const [profilesById, setProfilesById] = useState(() => new Map())
  const [loansById, setLoansById] = useState(() => new Map())

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    setMembersError('')

    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone, role, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setMembersError(extra ? `${error.message} (${extra})` : error.message)
      setMembers([])
      setMembersLoading(false)
      return
    }

    const list = data ?? []
    setMembers(list)
    setProfilesById((prev) => {
      const m = new Map(prev)
      for (const p of list) m.set(p.user_id, p)
      return m
    })
    setMembersLoading(false)
  }, [])

  const loadInterestPayments = useCallback(async () => {
    setPaymentsLoading(true)
    setPaymentsError('')

    const { data, error } = await supabase
      .from('prestamo_pagos')
      .select(
        'id, prestamo_id, socio_id, tipo, monto, capital_monto, interes_monto, fecha_pago, mes_correspondiente, comprobante_url, estado, comentarios, created_at',
      )
      .eq('estado', 'approved')
      .order('created_at', { ascending: false })

    if (error) {
      const extra = [error.code, error.hint].filter(Boolean).join(' · ')
      setPaymentsError(extra ? `${error.message} (${extra})` : error.message)
      setPayments([])
      setPaymentsLoading(false)
      return
    }

    const list = (data ?? []).filter((p) => Number(p.interes_monto ?? 0) > 0)
    setPayments(list)

    const userIds = Array.from(new Set(list.map((p) => p.socio_id).filter(Boolean)))
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone')
        .in('user_id', userIds)
      setProfilesById((prev) => {
        const m = new Map(prev)
        for (const p of profiles ?? []) m.set(p.user_id, p)
        return m
      })
    }

    const loanIds = Array.from(new Set(list.map((p) => p.prestamo_id).filter(Boolean)))
    if (loanIds.length) {
      const { data: loans } = await supabase
        .from('prestamos')
        .select('id, amount, user_id')
        .in('id', loanIds)
      setLoansById(() => {
        const m = new Map()
        for (const l of loans ?? []) m.set(l.id, l)
        return m
      })
    } else {
      setLoansById(new Map())
    }

    setPaymentsLoading(false)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadMembers(), loadInterestPayments()])
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [loadInterestPayments, loadMembers])

  useEffect(() => {
    const t = setTimeout(() => {
      loadAll()
    }, 0)
    return () => clearTimeout(t)
  }, [loadAll])

  const interestSummary = useMemo(() => {
    let totalInterest = 0
    const bySocio = new Map()

    for (const p of payments) {
      const interes = Number(p.interes_monto ?? 0)
      totalInterest += Number.isFinite(interes) ? interes : 0
      if (p.socio_id) {
        const prev = bySocio.get(p.socio_id) || 0
        bySocio.set(p.socio_id, prev + (Number.isFinite(interes) ? interes : 0))
      }
    }

    return { totalInterest, bySocio }
  }, [payments])

  const interestSharePerMember = useMemo(() => {
    const count = members.length || 0
    if (!count) return 0
    return interestSummary.totalInterest / count
  }, [interestSummary.totalInterest, members.length])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
          aria-label="Actualizar"
          title="Actualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">{error}</div>
      ) : null}

      {membersError ? (
        <div className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
          {membersError}
        </div>
      ) : null}

      {paymentsError ? (
        <div className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
          {paymentsError}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50 lg:col-span-1">
          <div className="text-sm font-bold text-slate-900">Resumen</div>
          <div className="mt-4 grid gap-2 rounded-2xl bg-purple-50 px-4 py-3 ring-1 ring-purple-200/60">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">Intereses aprobados acumulados</span>
              <span className="font-extrabold text-slate-900">{formatCop(interestSummary.totalInterest)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">Socios activos</span>
              <span className="font-extrabold text-slate-900">{membersLoading ? '—' : members.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">Ganancia por socio (proyección)</span>
              <span className="font-extrabold text-purple-700">{formatCop(interestSharePerMember)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50 lg:col-span-2">
          <div className="text-sm font-bold text-slate-900">Ganancia por socio</div>

          {membersLoading || paymentsLoading ? (
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
              ))}
            </div>
          ) : members.length ? (
            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-purple-200/60">
              <table className="w-full border-collapse bg-white">
                <thead className="bg-purple-50">
                  <tr className="text-left text-xs font-extrabold text-slate-700">
                    <th className="px-3 py-2">Socio</th>
                    <th className="px-3 py-2">Intereses pagados</th>
                    <th className="px-3 py-2">Ganancia asignada</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-900">
                  {members.map((m) => {
                    const paidInterest = interestSummary.bySocio.get(m.user_id) || 0
                    const label = m.full_name || m.phone || 'Socio'
                    return (
                      <tr key={m.user_id} className="border-t border-purple-100">
                        <td className="px-3 py-2 font-semibold">{label}</td>
                        <td className="px-3 py-2">{formatCop(paidInterest)}</td>
                        <td className="px-3 py-2 font-extrabold text-purple-700">{formatCop(interestSharePerMember)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
              <div className="text-sm font-bold text-slate-900">Sin socios activos</div>
              <div className="mt-1 text-sm text-slate-500">No hay socios activos para repartir intereses.</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
        <div className="text-sm font-bold text-slate-900">Historial de intereses</div>

        {paymentsLoading ? (
          <div className="mt-4 grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
            ))}
          </div>
        ) : payments.length ? (
          <div className="mt-4 grid gap-2">
            {payments.map((p) => {
              const profile = profilesById.get(p.socio_id)
              const name = profile?.full_name || profile?.phone || 'Socio'
              const paidAt = p.fecha_pago
                ? new Date(p.fecha_pago).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                : p.created_at
                ? new Date(p.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                : '—'
              const loan = loansById.get(p.prestamo_id)
              const receiptUrl = p.comprobante_url ? publicUrlFor(p.comprobante_url) : ''

              return (
                <div key={p.id} className="rounded-2xl border border-purple-200/50 bg-white px-3 py-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-slate-900">{name}</div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        {paidAt}
                        {p.mes_correspondiente ? ` · ${p.mes_correspondiente}` : ''}
                        {loan?.amount ? ` · Préstamo: ${formatCop(loan.amount)}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-extrabold text-slate-900">{formatCop(p.interes_monto ?? 0)}</div>
                      {receiptUrl ? (
                        <a
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                          href={receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver comprobante
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
            <div className="text-sm font-bold text-slate-900">Sin intereses</div>
            <div className="mt-1 text-sm text-slate-500">Aún no hay intereses aprobados.</div>
          </div>
        )}
      </div>
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
  if (section === 'intereses') return <AdminIntereses title={copy.title} description={copy.description} />

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
