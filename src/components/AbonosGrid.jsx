import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Layers, Pencil, RefreshCw, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

function isoDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

function monthNameEs(m) {
  return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][m]
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

function getPeriodMonths(now = new Date()) {
  const year = now.getFullYear()
  const start = new Date(year - 1, 11, 1)
  const months = []
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    months.push({
      year: y,
      month: m,
      label: `${monthNameEs(m)} ${y}`,
      periodDate: isoDate(d),
      q1Day: 15,
      q2Day: new Date(y, m + 1, 0).getDate(),
    })
  }
  return months
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

function statusPill(status) {
  if (status === 'approved') return 'bg-purple-50 text-purple-700 ring-purple-200/70'
  if (status === 'pending') return 'bg-pink-50 text-pink-600 ring-pink-200/70'
  if (status === 'rejected') return 'bg-pink-50 text-pink-600 ring-pink-200/70'
  return 'bg-purple-50 text-purple-700 ring-purple-200/70'
}

export default function AbonosGrid({ mode, userId }) {
  const months = useMemo(() => getPeriodMonths(new Date()), [])
  const year = new Date().getFullYear()
  const periodStart = useMemo(() => new Date(year - 1, 11, 1), [year])
  const periodEnd = useMemo(() => new Date(year, 11, 0), [year])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalCell, setModalCell] = useState(null)
  const [saving, setSaving] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('pending')
  const [paidAt, setPaidAt] = useState('')

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkFrom, setBulkFrom] = useState('')
  const [bulkTo, setBulkTo] = useState('')
  const [bulkAction, setBulkAction] = useState('create')
  const [bulkQuincena, setBulkQuincena] = useState('both')
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkNote, setBulkNote] = useState('')
  const [bulkPaidAt, setBulkPaidAt] = useState(toDatetimeLocal(new Date().toISOString()))
  const [bulkStatus, setBulkStatus] = useState('approved')
  const [bulkSaving, setBulkSaving] = useState(false)

  const cellRecordsMap = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const key = `${r.period_date}|${r.quincena}`
      const prev = m.get(key) ?? []
      prev.push(r)
      m.set(key, prev)
    }
    for (const [key, list] of m.entries()) {
      list.sort((a, b) => {
        const da = a?.created_at ? new Date(a.created_at).getTime() : 0
        const db = b?.created_at ? new Date(b.created_at).getTime() : 0
        if (da !== db) return da - db
        const ia = a?.id ? String(a.id) : ''
        const ib = b?.id ? String(b.id) : ''
        return ia.localeCompare(ib)
      })
      m.set(key, list)
    }
    return m
  }, [rows])

  const latestRecordMap = useMemo(() => {
    const m = new Map()
    for (const [key, list] of cellRecordsMap.entries()) {
      m.set(key, list[list.length - 1] ?? null)
    }
    return m
  }, [cellRecordsMap])

  const totalAhorrado = useMemo(() => {
    return rows
      .filter((r) => r.status === 'approved')
      .reduce((acc, r) => acc + Number(r.amount || 0), 0)
  }, [rows])

  const monthIndexByPeriodDate = useMemo(() => {
    const m = new Map()
    months.forEach((mm, i) => m.set(mm.periodDate, i))
    return m
  }, [months])

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError('')

    const from = isoDate(periodStart)
    const to = isoDate(periodEnd)

    const first = await supabase
      .from('abonos')
      .select('id, user_id, period_date, quincena, amount, status, note, created_at, created_by, paid_at')
      .eq('user_id', userId)
      .gte('period_date', from)
      .lte('period_date', to)
      .order('period_date', { ascending: true })
      .order('quincena', { ascending: true })

    if (first.error) {
      if (first.error.code === '42703' && String(first.error.message ?? '').includes('paid_at')) {
        const second = await supabase
          .from('abonos')
          .select('id, user_id, period_date, quincena, amount, status, note, created_at, created_by')
          .eq('user_id', userId)
          .gte('period_date', from)
          .lte('period_date', to)
          .order('period_date', { ascending: true })
          .order('quincena', { ascending: true })

        if (second.error) {
          setLoading(false)
          const extra = [second.error.code, second.error.hint].filter(Boolean).join(' · ')
          setError(extra ? `${second.error.message} (${extra})` : second.error.message)
          return
        }

        setRows(second.data ?? [])
        setLoading(false)
        return
      }

      setLoading(false)
      const extra = [first.error.code, first.error.hint].filter(Boolean).join(' · ')
      setError(extra ? `${first.error.message} (${extra})` : first.error.message)
      return
    }

    setRows(first.data ?? [])
    setLoading(false)
  }, [periodEnd, periodStart, userId])

  useEffect(() => {
    const t = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`abonos-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'abonos',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          load()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, userId])

  function openCell(month, quincena) {
    const key = `${month.periodDate}|${quincena}`
    const existing = latestRecordMap.get(key) ?? null
    const history = cellRecordsMap.get(key) ?? []

    setModalCell({ month, quincena, existing, history })
    setAmount(existing?.amount ? String(existing.amount) : '')
    setNote(existing?.note ?? '')
    setPaidAt(toDatetimeLocal(existing?.paid_at || existing?.created_at || new Date().toISOString()))
    if (mode === 'admin') setStatus(existing?.status ?? 'approved')
    else setStatus('pending')
    setModalOpen(true)
  }

  async function handleSave() {
    setError('')
    if (!modalCell) return

    if (mode !== 'admin' && modalCell.existing?.status && modalCell.existing.status !== 'rejected') {
      setError('No puedes modificar un abono cuando está Pendiente o Aprobado. Solo puedes re-enviar cuando esté Rechazado.')
      return
    }

    const raw = String(amount ?? '').replace(/[^\d]/g, '')
    const numeric = raw ? Number(raw) : 0

    if (!numeric || numeric <= 0) {
      setError('Ingresa un valor válido')
      return
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()

    if (sessionError) {
      setError(sessionError.message)
      return
    }

    const session = sessionData.session
    if (!session) {
      setError('No hay sesión activa')
      return
    }

    setSaving(true)

    const paidIso = datetimeLocalToIso(paidAt) || new Date().toISOString()
    const payload = {
      user_id: userId,
      period_date: modalCell.month.periodDate,
      quincena: modalCell.quincena,
      amount: numeric,
      note: String(note ?? '').trim() || null,
      status: mode === 'admin' ? status : 'pending',
      created_by: session.user.id,
      paid_at: paidIso,
    }

    const shouldInsert =
      !modalCell.existing?.id ||
      (mode !== 'admin' && modalCell.existing?.status === 'rejected')

    if (!shouldInsert && modalCell.existing?.id) {
      const { error: updateError } = await supabase
        .from('abonos')
        .update({
          amount: payload.amount,
          note: payload.note,
          status: payload.status,
          paid_at: payload.paid_at,
        })
        .eq('id', modalCell.existing.id)

      setSaving(false)

      if (updateError) {
        setError(updateError.message)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('abonos').insert(payload)
      setSaving(false)

      if (insertError) {
        if (insertError.code === '23505') {
          setError(
            'No se pudo guardar el historial porque la base de datos no permite múltiples intentos para el mismo periodo/quincena. Hay que ajustar la restricción UNIQUE para conservar historial.',
          )
          return
        }
        setError(insertError.message)
        return
      }
    }

    setModalOpen(false)
    await load()
  }

  function openBulk() {
    const now = new Date()
    const currentPeriodDate = isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const fallback = months.find((m) => m.periodDate === currentPeriodDate)?.periodDate ?? months.at(0)?.periodDate ?? ''
    setBulkFrom(fallback)
    setBulkTo(fallback)
    setBulkAction('create')
    setBulkQuincena('both')
    setBulkAmount('')
    setBulkNote('')
    setBulkPaidAt(toDatetimeLocal(new Date().toISOString()))
    setBulkStatus('approved')
    setBulkOpen(true)
  }

  async function handleBulkSave() {
    setError('')
    if (!bulkFrom || !bulkTo) {
      setError('Selecciona el rango de meses')
      return
    }

    const fromIdx = monthIndexByPeriodDate.get(bulkFrom)
    const toIdx = monthIndexByPeriodDate.get(bulkTo)
    if (typeof fromIdx !== 'number' || typeof toIdx !== 'number') {
      setError('Rango inválido')
      return
    }

    const start = Math.min(fromIdx, toIdx)
    const end = Math.max(fromIdx, toIdx)
    const selectedMonths = months.slice(start, end + 1)

    const qs = bulkQuincena === 'both' ? [1, 2] : [Number(bulkQuincena)]
    if (!qs.every((q) => q === 1 || q === 2)) {
      setError('Selecciona una quincena válida')
      return
    }

    if (mode === 'admin' && bulkAction === 'approve') {
      const idsToApprove = []
      for (const m of selectedMonths) {
        for (const q of qs) {
          const key = `${m.periodDate}|${q}`
          const existing = latestRecordMap.get(key) ?? null
          if (existing?.id && existing.status === 'pending') idsToApprove.push(existing.id)
        }
      }

      if (!idsToApprove.length) {
        setError('No hay abonos Pendientes para aprobar en ese rango.')
        return
      }

      setBulkSaving(true)
      const { error: updateError } = await supabase
        .from('abonos')
        .update({ status: 'approved' })
        .in('id', idsToApprove)
      setBulkSaving(false)

      if (updateError) {
        setError(updateError.message)
        return
      }

      setBulkOpen(false)
      await load()
      return
    }

    const raw = String(bulkAmount ?? '').replace(/[^\d]/g, '')
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

    const session = sessionData.session
    if (!session) {
      setError('No hay sesión activa')
      return
    }

    const paidIso = datetimeLocalToIso(bulkPaidAt) || new Date().toISOString()
    const desiredStatus = mode === 'admin' ? bulkStatus : 'pending'

    const payloads = []
    for (const m of selectedMonths) {
      for (const q of qs) {
        const key = `${m.periodDate}|${q}`
        const existing = latestRecordMap.get(key) ?? null

        if (mode !== 'admin' && existing?.status && existing.status !== 'rejected') continue
        if (existing?.status === 'pending' || existing?.status === 'approved') continue

        payloads.push({
          user_id: userId,
          period_date: m.periodDate,
          quincena: q,
          amount: numeric,
          note: String(bulkNote ?? '').trim() || null,
          status: desiredStatus,
          created_by: session.user.id,
          paid_at: paidIso,
        })
      }
    }

    if (!payloads.length) {
      setError('No hay cuotas disponibles para registrar en ese rango (ya existen Pendientes/Aprobadas).')
      return
    }

    setBulkSaving(true)
    const { error: insertError } = await supabase.from('abonos').insert(payloads)
    setBulkSaving(false)

    if (insertError) {
      if (insertError.code === '23505') {
        setError(
          'No se pudo guardar el aporte masivo porque la base de datos no permite múltiples intentos para el mismo periodo/quincena. Hay que ajustar la restricción UNIQUE para conservar historial.',
        )
        return
      }
      setError(insertError.message)
      return
    }

    setBulkOpen(false)
    await load()
  }

  const grid = (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {months.map((m) => {
        const q1 = latestRecordMap.get(`${m.periodDate}|1`) ?? null
        const q2 = latestRecordMap.get(`${m.periodDate}|2`) ?? null

        function Cell({ quincena, q, label, dueDay }) {
          const statusLabel =
            q?.status === 'approved'
              ? 'Aprobado'
              : q?.status === 'pending'
              ? 'Pendiente'
              : q?.status === 'rejected'
              ? 'Rechazado'
              : '—'

          const locked = mode !== 'admin' && q?.status && q.status !== 'rejected'

          return (
            <button
              type="button"
              onClick={() => openCell(m, quincena)}
              className={[
                'flex w-full items-center justify-between gap-3 rounded-2xl border border-purple-200/50 bg-white px-3 py-2 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                locked ? 'opacity-75' : 'hover:bg-purple-50',
              ].join(' ')}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500">
                  {label} · {dueDay}
                </div>
                <div className="mt-0.5 truncate text-sm font-extrabold text-slate-900">
                  {q?.amount ? formatCop(q.amount) : '—'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(q?.status)}`}>
                  {statusLabel}
                </span>
                {q?.id && !locked ? <Pencil className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
              </div>
            </button>
          )
        }

        return (
          <div
            key={m.periodDate}
            className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-slate-900">{m.label}</div>
              <div className="text-xs font-semibold text-slate-500">Q1 / Q2</div>
            </div>

            <div className="mt-3 grid gap-2">
              <Cell quincena={1} q={q1} label="Quincena 1" dueDay={m.q1Day} />
              <Cell quincena={2} q={q2} label="Quincena 2" dueDay={m.q2Day} />
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div>
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-slate-900">Abonos</div>
            <div className="mt-1 text-sm text-slate-500">
              Periodo: Dic {year - 1} – Nov {year}. Dos por mes (Q1 y Q2).
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl bg-purple-50 p-5 ring-1 ring-purple-200/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-purple-700">Total ahorrado</div>
              <div className="mt-1 text-4xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-5xl">
                {formatCop(totalAhorrado)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openBulk}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-100 focus:outline-none focus:ring-4 focus:ring-purple-200"
              >
                <Layers className="h-4 w-4" aria-hidden="true" />
                Masivo
              </button>
              <button
                type="button"
                onClick={load}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-100 focus:outline-none focus:ring-4 focus:ring-purple-200"
                aria-label="Actualizar"
                title="Actualizar"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
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

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[170px] animate-pulse rounded-3xl bg-white ring-1 ring-purple-200/50"
            />
          ))}
        </div>
      ) : (
        grid
      )}

      <Modal
        open={modalOpen}
        title={
          mode === 'admin'
            ? 'Registrar abono'
            : 'Enviar solicitud de abono'
        }
        onClose={() => setModalOpen(false)}
      >
        {mode !== 'admin' && modalCell?.existing?.status && modalCell.existing.status !== 'rejected' ? (
          <div className="mb-4 rounded-2xl border border-purple-200/60 bg-purple-50 px-3 py-2 text-sm font-semibold text-slate-900">
            Este abono está {modalCell.existing.status === 'approved' ? 'Aprobado' : 'Pendiente'} y no se puede modificar.
          </div>
        ) : null}

        <div className="grid gap-4">
          <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
            <div className="text-xs font-semibold text-purple-700">Periodo</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {modalCell?.month?.label} · Q{modalCell?.quincena}
            </div>
          </div>

          {modalCell?.history?.length ? (
            <div className="rounded-2xl border border-purple-200/60 bg-white px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">Historial</div>
              <div className="mt-2 grid gap-2">
                {[...modalCell.history]
                  .slice()
                  .reverse()
                  .map((h) => {
                    const whenValue = h?.paid_at || h?.created_at
                    const when = whenValue
                      ? new Date(whenValue).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'
                    return (
                      <div
                        key={h.id ?? `${h.period_date}|${h.quincena}|${h.created_at ?? ''}`}
                        className="flex items-start justify-between gap-3 rounded-xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-slate-900">
                            {h?.amount ? formatCop(h.amount) : '—'}
                          </div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-500">{when}</div>
                          {h?.note ? (
                            <div className="mt-1 break-words text-xs text-slate-700">{h.note}</div>
                          ) : null}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(h?.status)}`}>
                          {h?.status === 'approved'
                            ? 'Aprobado'
                            : h?.status === 'pending'
                            ? 'Pendiente'
                            : h?.status === 'rejected'
                            ? 'Rechazado'
                            : '—'}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          ) : null}

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">Fecha del aporte</span>
            <input
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              disabled={mode !== 'admin' && modalCell?.existing?.status && modalCell.existing.status !== 'rejected'}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">Valor</span>
            <input
              className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              disabled={mode !== 'admin' && modalCell?.existing?.status && modalCell.existing.status !== 'rejected'}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-500">Nota</span>
            <textarea
              className="min-h-[90px] w-full resize-none rounded-xl border border-purple-200/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(Opcional)"
              disabled={mode !== 'admin' && modalCell?.existing?.status && modalCell.existing.status !== 'rejected'}
            />
          </label>

          {mode === 'admin' ? (
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">
                Estado
              </span>
              <select
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="approved">Aprobado</option>
                <option value="pending">Pendiente</option>
                <option value="rejected">Rechazado</option>
              </select>
            </label>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => setModalOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                saving ||
                (mode !== 'admin' && modalCell?.existing?.status && modalCell.existing.status !== 'rejected')
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
              onClick={handleSave}
            >
              {mode === 'admin' ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Guardando…' : 'Guardar'}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Enviando…' : 'Enviar'}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={bulkOpen}
        title={mode === 'admin' ? 'Aporte masivo' : 'Solicitud masiva de abonos'}
        onClose={() => setBulkOpen(false)}
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Desde</span>
              <select
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
                disabled={bulkSaving}
              >
                {months.map((m) => (
                  <option key={m.periodDate} value={m.periodDate}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Hasta</span>
              <select
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={bulkTo}
                onChange={(e) => setBulkTo(e.target.value)}
                disabled={bulkSaving}
              >
                {months.map((m) => (
                  <option key={m.periodDate} value={m.periodDate}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {mode === 'admin' ? (
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Acción</span>
                <select
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                  disabled={bulkSaving}
                >
                  <option value="create">Registrar cuotas</option>
                  <option value="approve">Aprobar pendientes</option>
                </select>
              </label>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-slate-500">Quincena</span>
              <select
                className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                value={bulkQuincena}
                onChange={(e) => setBulkQuincena(e.target.value)}
                disabled={bulkSaving}
              >
                <option value="both">Q1 y Q2</option>
                <option value="1">Solo Q1</option>
                <option value="2">Solo Q2</option>
              </select>
            </label>

            {mode === 'admin' && bulkAction === 'create' ? (
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Estado</span>
                <select
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  disabled={bulkSaving}
                >
                  <option value="approved">Aprobado</option>
                  <option value="pending">Pendiente</option>
                </select>
              </label>
            ) : null}
          </div>

          {!(mode === 'admin' && bulkAction === 'approve') ? (
            <>
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Fecha del aporte</span>
                <input
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  type="datetime-local"
                  value={bulkPaidAt}
                  onChange={(e) => setBulkPaidAt(e.target.value)}
                  disabled={bulkSaving}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Valor (por cuota)</span>
                <input
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  inputMode="numeric"
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                  placeholder="50000"
                  disabled={bulkSaving}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold text-slate-500">Nota</span>
                <textarea
                  className="min-h-[90px] w-full resize-none rounded-xl border border-purple-200/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="(Opcional)"
                  disabled={bulkSaving}
                />
              </label>
            </>
          ) : (
            <div className="rounded-2xl bg-purple-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-purple-200/60">
              Se aprobarán todos los abonos <span className="font-extrabold">Pendientes</span> dentro del rango y quincena seleccionados.
            </div>
          )}

          {error ? (
            <div role="alert" className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              onClick={() => setBulkOpen(false)}
              disabled={bulkSaving}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Cancelar
            </button>
            <button
              type="button"
              disabled={bulkSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60 disabled:hover:bg-purple-700"
              onClick={handleBulkSave}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {bulkSaving ? 'Guardando…' : mode === 'admin' && bulkAction === 'approve' ? 'Aprobar masivo' : 'Guardar masivo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
