import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, RefreshCw, Send, Paperclip } from 'lucide-react'
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

function guessExtFromName(name) {
  const n = String(name ?? '')
  const idx = n.lastIndexOf('.')
  if (idx === -1) return 'jpg'
  return n.slice(idx + 1).toLowerCase() || 'jpg'
}

const BUCKET = import.meta.env.VITE_STORAGE_BUCKET || 'nati-app'

function normalizeMonthLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function monthLabelForNow() {
  return new Date().toLocaleString('es-CO', { month: 'long', year: 'numeric' })
}

function dueDateForYear(year) {
  return new Date(year, 10, 15, 23, 59, 59, 999)
}

function formatShortDate(value) {
  try {
    return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
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

export default function SocioPrestamos() {
  const DEFAULT_INTEREST = 5
  const DEFAULT_MAX_PERCENT = 70

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [settings, setSettings] = useState({ interest: DEFAULT_INTEREST, maxPercent: DEFAULT_MAX_PERCENT })
  const [mySavings, setMySavings] = useState(0)
  const [maxRequestCap, setMaxRequestCap] = useState(0)
  const [loans, setLoans] = useState([])
  const [payments, setPayments] = useState([])
  const [userId, setUserId] = useState(null)

  // Formulario de Solicitud
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [reqError, setReqError] = useState('')
  const [reqSuccess, setReqSuccess] = useState('')

  // Formulario de Pago
  const [payLoanId, setPayLoanId] = useState(null)
  const [payType, setPayType] = useState('interes') // 'interes' | 'total'
  const [payMonth, setPayMonth] = useState('')
  const [payTotalStr, setPayTotalStr] = useState('')
  const [payFile, setPayFile] = useState(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [paySuccess, setPaySuccess] = useState('')
  const [payModalOpen, setPayModalOpen] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) {
      setError('No hay sesión activa')
      setLoading(false)
      return
    }

    const uid = sessionData.session.user.id
    setUserId(uid)

    try {
      // 1. Settings
      const { data: setts } = await supabase
        .from('loan_settings')
        .select('interest_rate_percent, max_loan_percent')
        .eq('id', 1)
        .maybeSingle()
      
      const ir = setts?.interest_rate_percent ?? DEFAULT_INTEREST
      const mp = setts?.max_loan_percent ?? DEFAULT_MAX_PERCENT
      setSettings({ interest: ir, maxPercent: mp })

      // 2. Mis Ahorros (usando RPC)
      const { data: misAhorros } = await supabase.rpc('get_socio_total_ahorro', { p_socio_id: uid })
      const savingsNum = Number(misAhorros || 0)
      setMySavings(savingsNum)

      const fallbackCap = savingsNum * (Number(mp) / 100)
      const { data: maxCap, error: maxCapError } = await supabase.rpc('get_socio_max_prestamo', { p_socio_id: uid })
      if (maxCapError) {
        setMaxRequestCap(Number(fallbackCap || 0))
      } else {
        setMaxRequestCap(Number(maxCap || 0))
      }

      // 4. Mis Préstamos
      const { data: misPrestamos } = await supabase
        .from('prestamos')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      setLoans(misPrestamos || [])

      // 5. Mis Pagos
      const { data: misPagos } = await supabase
        .from('prestamo_pagos')
        .select('*')
        .eq('socio_id', uid)
        .order('created_at', { ascending: false })
      setPayments(misPagos || [])

    } catch (err) {
      setError(err.message)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      loadData()
    }, 0)
    return () => clearTimeout(t)
  }, [loadData])

  async function requestLoan(e) {
    e.preventDefault()
    setReqError('')
    setReqSuccess('')

    const val = Number(amountStr)
    if (!Number.isFinite(val) || val <= 0) {
      setReqError('Monto inválido')
      return
    }

    const capFallback = mySavings * (settings.maxPercent / 100)
    const cap = Math.max(0, Number.isFinite(maxRequestCap) && maxRequestCap > 0 ? maxRequestCap : capFallback)
    if (val > cap) {
      setReqError(`El monto supera tu máximo permitido (${formatCop(cap)})`)
      return
    }

    // Check pending loans
    const hasPending = loans.some((l) => l.status === 'pending')
    if (hasPending) {
      setReqError('Ya tienes una solicitud de préstamo en revisión.')
      return
    }

    setRequesting(true)
    const payload = {
      user_id: userId,
      amount: val,
      interest_rate_percent: settings.interest,
      status: 'pending',
      note: note.trim() || null,
    }

    const { error } = await supabase.from('prestamos').insert(payload)
    setRequesting(false)

    if (error) {
      setReqError(error.message)
      return
    }

    setReqSuccess('Solicitud enviada correctamente')
    setAmountStr('')
    setNote('')
    await loadData()
  }

  async function submitPayment(e) {
    e.preventDefault()
    setPayError('')
    setPaySuccess('')

    if (!payLoanId) {
      setPayError('Selecciona un préstamo')
      return
    }

    if (!payFile) {
      setPayError('Debes adjuntar el comprobante de pago')
      return
    }

    if (payType === 'interes' && !payMonth) {
      setPayError('Debes escribir el mes correspondiente')
      return
    }

    const loan = loans.find(l => l.id === payLoanId)
    if (!loan) {
      setPayError('Préstamo no encontrado')
      return
    }

    const principal = Number(loan.amount)
    const rate = Number(loan.interest_rate_percent)
    const interestMonth = principal * (Number.isFinite(rate) ? rate : 0) / 100

    const totalPaid =
      payType === 'total' ? Number(payTotalStr) : interestMonth

    if (!Number.isFinite(totalPaid) || totalPaid <= 0) {
      setPayError('Monto inválido')
      return
    }

    if (payType === 'total' && totalPaid < principal) {
      setPayError(`Si vas a pagar el total, el monto debe ser al menos ${formatCop(principal)}`)
      return
    }

    const capitalMonto = payType === 'total' ? principal : 0
    const interesMonto = payType === 'total' ? Math.max(0, totalPaid - principal) : totalPaid

    setPaying(true)

    // Upload receipt
    const ext = guessExtFromName(payFile.name)
    const filePath = `prestamos/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, payFile)
    if (uploadError) {
      setPayError(`Error subiendo comprobante: ${uploadError.message}`)
      setPaying(false)
      return
    }

    const payload = {
      prestamo_id: payLoanId,
      socio_id: userId,
      tipo: payType,
      monto: totalPaid,
      capital_monto: capitalMonto,
      interes_monto: interesMonto,
      mes_correspondiente: payType === 'interes' ? payMonth : null,
      comprobante_url: filePath,
      estado: 'pending',
    }

    const { error } = await supabase.from('prestamo_pagos').insert(payload)
    setPaying(false)

    if (error) {
      setPayError(error.message)
      return
    }

    setPaySuccess('Pago reportado correctamente. Espera aprobación del administrador.')
    setPayLoanId(null)
    setPayType('interes')
    setPayMonth('')
    setPayTotalStr('')
    setPayFile(null)
    await loadData()
  }

  const activeLoans = useMemo(() => loans.filter(l => l.status === 'approved'), [loans])
  const paidCapitalByLoanId = useMemo(() => {
    const m = new Map()
    for (const p of payments) {
      if (p.estado !== 'approved') continue
      if (!p.prestamo_id) continue
      const cap = Number(
        p.capital_monto ?? (p.tipo === 'total' || p.tipo === 'capital' ? p.monto : 0),
      )
      const prev = m.get(p.prestamo_id) || 0
      m.set(p.prestamo_id, prev + (Number.isFinite(cap) ? cap : 0))
    }
    return m
  }, [payments])

  const liquidatedLoanIds = useMemo(() => {
    const s = new Set()
    for (const l of activeLoans) {
      const paid = paidCapitalByLoanId.get(l.id) || 0
      const principal = Number(l.amount)
      if (Number.isFinite(principal) && paid >= principal) s.add(l.id)
    }
    return s
  }, [activeLoans, paidCapitalByLoanId])

  const payableLoans = useMemo(() => activeLoans.filter((l) => !liquidatedLoanIds.has(l.id)), [activeLoans, liquidatedLoanIds])

  const interestPaidByLoanMonthKey = useMemo(() => {
    const m = new Map()
    for (const p of payments) {
      if (p.estado === 'rejected') continue
      if (p.tipo !== 'interes') continue
      if (!p.prestamo_id) continue
      const k = normalizeMonthLabel(p.mes_correspondiente)
      if (!k) continue
      const set = m.get(p.prestamo_id) || new Set()
      set.add(k)
      m.set(p.prestamo_id, set)
    }
    return m
  }, [payments])

  const nowMonthLabel = useMemo(() => monthLabelForNow(), [])
  const nowMonthKey = useMemo(() => normalizeMonthLabel(nowMonthLabel), [nowMonthLabel])
  const dueDate = useMemo(() => dueDateForYear(new Date().getFullYear()), [])

  function selectLoanForPayment(loanId, type) {
    const loan = payableLoans.find((l) => l.id === loanId)
    if (!loan) return

    setPayError('')
    setPaySuccess('')
    setPayLoanId(loanId)
    setPayType(type)
    setPayFile(null)
    setPayModalOpen(true)

    if (type === 'interes') {
      setPayTotalStr('')
      setPayMonth((prev) => {
        const v = String(prev || '').trim()
        if (v) return v
        return nowMonthLabel
      })
    } else {
      setPayMonth('')
      setPayTotalStr((prev) => {
        const v = String(prev || '').trim()
        if (v) return v
        const principal = Number(loan.amount)
        return Number.isFinite(principal) && principal > 0 ? String(principal) : ''
      })
    }
  }

  return (
    <div className="w-full space-y-4 pb-16">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Préstamos</h1>
          <p className="mt-1 text-sm text-slate-500">Solicita préstamos y gestiona tu plan de pagos.</p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-900">Mis préstamos</div>
            <div className="text-xs font-semibold text-slate-500">{loans.length}</div>
          </div>
          {loans.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-purple-50 px-3 py-3 text-sm text-slate-700 ring-1 ring-purple-200/60">
              Aún no tienes préstamos registrados.
            </div>
          ) : (
            <div className="mt-3 max-h-56 overflow-auto pr-1">
              <div className="grid gap-2">
                {loans.map((l) => {
                  const createdAt = l.created_at ? new Date(l.created_at).toLocaleDateString('es-CO') : '—'
                  return (
                    <div key={l.id} className="rounded-2xl border border-purple-200/50 bg-white px-3 py-2 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-slate-900">{formatCop(l.amount)}</div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-500">
                            {createdAt} · {l.interest_rate_percent}% mensual
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(l.status)}`}>
                          {l.status === 'approved' ? 'Aprobado' : l.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                        </span>
                      </div>
                      {l.decision_note && l.status === 'rejected' ? (
                        <div className="mt-2 rounded-xl bg-pink-50 px-3 py-2 text-xs font-semibold text-pink-700 ring-1 ring-pink-200/70">
                          Motivo: {l.decision_note}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-900">Historial de pagos</div>
            <div className="text-xs font-semibold text-slate-500">{payments.length}</div>
          </div>
          {payments.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-purple-50 px-3 py-3 text-sm text-slate-700 ring-1 ring-purple-200/60">
              Aún no hay pagos reportados.
            </div>
          ) : (
            <div className="mt-3 max-h-56 overflow-auto pr-1">
              <div className="grid gap-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 rounded-2xl border border-purple-200/50 bg-white px-3 py-2 shadow-sm">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900">{formatCop(p.monto)}</div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        {p.tipo === 'interes'
                          ? `Interés (${p.mes_correspondiente})`
                          : p.tipo === 'total'
                          ? 'Pago total'
                          : p.tipo === 'capital'
                          ? 'Capital'
                          : 'Pago'}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(p.estado)}`}>
                      {p.estado === 'approved' ? 'Aprobado' : p.estado === 'pending' ? 'Pendiente' : 'Rechazado'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_420px]">
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
              <div className="text-xs font-semibold text-slate-500">Mis ahorros</div>
              <div className="mt-1 text-lg font-extrabold text-slate-900">{formatCop(mySavings)}</div>
            </div>
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
              <div className="text-xs font-semibold text-slate-500">Máximo a pedir</div>
              <div className="mt-1 text-lg font-extrabold text-slate-900">
                {formatCop(maxRequestCap || mySavings * (settings.maxPercent / 100))}
              </div>
            </div>
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
              <div className="text-xs font-semibold text-slate-500">Interés mensual</div>
              <div className="mt-1 text-lg font-extrabold text-slate-900">{settings.interest}%</div>
            </div>
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
              <div className="text-xs font-semibold text-slate-500">Límite pago</div>
              <div className="mt-1 text-lg font-extrabold text-slate-900">{formatShortDate(dueDate)}</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-900">Pagos de préstamo</div>
                <div className="mt-1 text-sm text-slate-500">
                  Reporta el pago desde el botón de cada préstamo.
                </div>
              </div>
              <div className="rounded-2xl bg-purple-50 px-3 py-1.5 text-xs font-extrabold text-purple-700 ring-1 ring-purple-200/60">
                Límite: {formatShortDate(dueDate)}
              </div>
            </div>

            {payError ? (
              <div className="mt-3 rounded-2xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm text-pink-700">
                {payError}
              </div>
            ) : null}

            {paySuccess ? (
              <div className="mt-3 rounded-2xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-700">
                {paySuccess}
              </div>
            ) : null}

            {payableLoans.length === 0 ? (
              <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
                <div className="text-sm font-bold text-slate-900">Sin pagos pendientes</div>
                <div className="mt-1 text-sm text-slate-500">
                  No tienes préstamos aprobados pendientes por pagar o ya están liquidados.
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                {payableLoans.map((l) => {
                      const createdAt = l.created_at
                        ? new Date(l.created_at).toLocaleDateString('es-CO')
                        : '—'
                      const principal = Number(l.amount)
                      const rate = Number(l.interest_rate_percent)
                      const interestMonth = principal * (Number.isFinite(rate) ? rate : 0) / 100
                      const paidCapital = paidCapitalByLoanId.get(l.id) || 0
                      const remaining = Math.max(0, principal - paidCapital)
                      const progress = principal > 0 ? Math.min(100, Math.round((paidCapital / principal) * 100)) : 0
                      const paidMonths = interestPaidByLoanMonthKey.get(l.id) || new Set()
                      const hasInterestThisMonth = paidMonths.has(nowMonthKey)
                      const created = l.created_at ? new Date(l.created_at) : null
                      const createdSameMonth =
                        created &&
                        created.getFullYear() === new Date().getFullYear() &&
                        created.getMonth() === new Date().getMonth()
                      const overdue = new Date() > dueDate && remaining > 0
                      const statusLabel = overdue
                        ? 'Vencido'
                        : hasInterestThisMonth || createdSameMonth
                        ? 'Al día'
                        : 'Pendiente interés'
                      const statusTone = overdue
                        ? 'bg-pink-50 text-pink-700 ring-pink-200/70'
                        : hasInterestThisMonth || createdSameMonth
                        ? 'bg-purple-50 text-purple-700 ring-purple-200/70'
                        : 'bg-amber-50 text-amber-800 ring-amber-200/70'

                      return (
                        <div key={l.id} className="rounded-2xl border border-purple-200/50 bg-white px-3 py-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-base font-extrabold text-slate-900">{formatCop(principal)}</div>
                              <div className="mt-0.5 text-xs font-semibold text-slate-500">
                                {createdAt} · {Number.isFinite(rate) ? `${rate}%` : '—'} mensual
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-semibold text-slate-500">Saldo</div>
                              <div className="text-sm font-extrabold text-purple-700">{formatCop(remaining)}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone}`}>
                                {statusLabel}
                              </span>
                              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                                <CalendarDays className="h-3.5 w-3.5 text-purple-700" aria-hidden="true" />
                                {formatShortDate(dueDate)}
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                              <span>Interés del mes</span>
                              <span className="text-slate-900">{formatCop(interestMonth)}</span>
                            </div>

                            <div className="grid gap-1">
                              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                                <span>Capital pagado</span>
                                <span>{progress}%</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-purple-100">
                                <div className="h-full rounded-full bg-purple-600" style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => selectLoanForPayment(l.id, 'interes')}
                              className="inline-flex h-10 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                            >
                              Pagar interés
                            </button>
                            <button
                              type="button"
                              onClick={() => selectLoanForPayment(l.id, 'total')}
                              className="inline-flex h-10 items-center justify-center rounded-2xl bg-purple-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200"
                            >
                              Pagar total
                            </button>
                          </div>
                        </div>
                      )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="text-sm font-bold text-slate-900">Solicitar préstamo</div>
          <div className="mt-1 text-sm text-slate-500">Tu solicitud se valida por tu ahorro y reglas del ciclo.</div>

          <form onSubmit={requestLoan} className="mt-4 grid gap-3">
            {reqError ? (
              <div className="rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm text-pink-700">
                {reqError}
              </div>
            ) : null}
            {reqSuccess ? (
              <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-700">
                {reqSuccess}
              </div>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Monto a solicitar</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                type="number"
                min="0"
                step="1000"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={requesting}
                placeholder="Ej: 500000"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Nota o justificación (opcional)</span>
              <input
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={requesting}
              />
            </label>

            <button
              type="submit"
              disabled={requesting}
              className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {requesting ? 'Enviando...' : 'Enviar solicitud'}
            </button>
          </form>
        </div>
      </div>

      <Modal
        open={payModalOpen}
        title="Reportar pago"
        onClose={() => {
          setPayModalOpen(false)
          setPayFile(null)
          setPayError('')
          setPaySuccess('')
        }}
      >
        <div className="grid gap-4">
          {payError ? (
            <div className="rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm text-pink-700">
              {payError}
            </div>
          ) : null}

          {paySuccess ? (
            <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-700">
              {paySuccess}
            </div>
          ) : null}

          <form onSubmit={submitPayment} className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayType('interes')}
                className={[
                  'h-11 rounded-2xl border px-3 text-sm font-extrabold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                  payType === 'interes'
                    ? 'border-purple-300 bg-purple-700 text-white'
                    : 'border-purple-200/60 bg-white text-slate-900 hover:bg-purple-50',
                ].join(' ')}
              >
                Interés
              </button>
              <button
                type="button"
                onClick={() => setPayType('total')}
                className={[
                  'h-11 rounded-2xl border px-3 text-sm font-extrabold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                  payType === 'total'
                    ? 'border-purple-300 bg-purple-700 text-white'
                    : 'border-purple-200/60 bg-white text-slate-900 hover:bg-purple-50',
                ].join(' ')}
              >
                Total
              </button>
            </div>

            {payType === 'interes' ? (
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Mes a pagar</span>
                <input
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  value={payMonth}
                  onChange={(e) => setPayMonth(e.target.value)}
                  required
                />
                <div className="text-[11px] font-semibold text-slate-500">
                  Sugerido: <span className="text-slate-900">{nowMonthLabel}</span>
                </div>
              </label>
            ) : (
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Monto pagado (capital + intereses)</span>
                <input
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  type="number"
                  min="0"
                  step="1000"
                  value={payTotalStr}
                  onChange={(e) => setPayTotalStr(e.target.value)}
                  required
                />
              </label>
            )}

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Comprobante</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPayFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-purple-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-purple-700 hover:file:bg-purple-200"
                required
              />
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={paying}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
              >
                <Paperclip className="h-4 w-4" />
                {paying ? 'Reportando…' : 'Reportar pago'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  )
}
