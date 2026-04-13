import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, HandCoins, Users, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'

function formatCop(value) {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `$ ${Number(value || 0).toLocaleString('es-CO')}`
  }
}

function isoDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

function monthNameEs(m) {
  return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][m]
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
      label: monthNameEs(m),
      fullLabel: `${monthNameEs(m)} ${y}`,
      periodDate: isoDate(d),
    })
  }
  return months
}

function MetricCard({ title, value, hint, to, icon, accent = 'purple' }) {
  const accentClasses =
    accent === 'pink'
      ? {
          badge: 'bg-pink-50 text-pink-600 ring-1 ring-pink-200/70',
          ring: 'hover:ring-pink-200',
        }
      : {
          badge: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/70',
          ring: 'hover:ring-purple-200',
        }

  return (
    <Link
      to={to}
      className={[
        'group rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50 transition',
        'hover:-translate-y-0.5 hover:shadow-md hover:ring-2',
        accentClasses.ring,
        'focus:outline-none focus:ring-4 focus:ring-purple-200',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">
            {title}
          </div>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
            {value}
          </div>
          <div className="mt-1 text-sm text-slate-500">{hint}</div>
        </div>
        <div
          className={[
            'grid h-11 w-11 place-items-center rounded-2xl',
            accentClasses.badge,
          ].join(' ')}
          aria-hidden="true"
        >
          {icon}
        </div>
      </div>
    </Link>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="mb-3 rounded-3xl border border-pink-300 bg-pink-50 px-4 py-3 text-sm font-semibold text-pink-900 shadow-sm ring-1 ring-pink-200/70"
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

function LineChart({ title, rangeLabel, data }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const min = Math.min(...data.map((d) => d.value), 0)
  const from = data.at(0)?.label
  const to = data.at(-1)?.label
  const total = data.reduce((acc, d) => acc + d.value, 0)
  const avg = Math.round(total / Math.max(data.length, 1))

  const width = 360
  const height = 120
  const padX = 10
  const padY = 12
  const innerW = width - padX * 2
  const innerH = height - padY * 2
  const range = Math.max(max - min, 1)

  const points = data.map((d, i) => {
    const x =
      data.length <= 1 ? padX + innerW / 2 : padX + (innerW * i) / (data.length - 1)
    const y = padY + innerH - ((d.value - min) / range) * innerH
    return { x, y, tone: d.tone }
  })

  const strokeTone = data.some((d) => d.tone === 'pink') ? 'pink' : 'purple'
  const lineStroke = strokeTone === 'pink' ? '#fc46ab' : '#8a0cd2'

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ')

  const areaPath = `${linePath} L ${padX + innerW} ${padY + innerH} L ${padX} ${
    padY + innerH
  } Z`

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-500">
            {rangeLabel ?? (from && to ? `${from} – ${to}` : 'Meses')}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-purple-200/50 bg-purple-50 p-3">
        <svg
          className="h-[120px] w-full"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
          preserveAspectRatio="none"
        >
          <title>{title}</title>
          <desc>{rangeLabel ?? (from && to ? `${from} – ${to}` : 'Meses')}</desc>

          <path d={areaPath} fill={lineStroke} opacity="0.06" />
          <path
            d={linePath}
            fill="none"
            stroke={lineStroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.75"
          />

          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="2.6"
              fill="#ffffff"
              stroke={lineStroke}
              strokeWidth="1.5"
              opacity="0.9"
            />
          ))}
        </svg>

        <div className="mt-3 grid grid-cols-6 gap-y-2 text-[10px] font-semibold text-slate-500">
          {data.map((d, i) => (
            <div key={`${d.label}-${i}`} className="text-center">
              {d.label}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs font-semibold text-slate-500">
        <div>
          Total: <span className="text-slate-900">{formatCop(total)}</span>
        </div>
        <div>
          Promedio mensual:{' '}
          <span className="text-slate-900">{formatCop(avg)}</span>
        </div>
      </div>
    </div>
  )
}

function PieChart({ title, data }) {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1
  const r = 18
  const c = 2 * Math.PI * r
  const dashes = data.map((d) => (d.value / total) * c)
  const offsets = data.map((_d, i) =>
    dashes.slice(0, i).reduce((acc, v) => acc + v, 0),
  )

  const swatchClass = {
    purple: 'bg-purple-700',
    purple2: 'bg-purple-500',
    pink: 'bg-pink-600',
    pink2: 'bg-pink-500',
  }

  const strokeClass = {
    purple: '#8a0cd2',
    purple2: '#ae50e6',
    pink: '#fc46ab',
    pink2: '#fe5ca8',
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
      <div className="text-sm font-bold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-500">
        Distribución del mes
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
        <div className="mx-auto grid place-items-center">
          <svg
            className="h-40 w-40 max-w-full"
            viewBox="0 0 48 48"
            role="img"
            aria-label={title}
          >
            <circle cx="24" cy="24" r={r} fill="none" stroke="#e3cef7" strokeWidth="8" />
            <g transform="rotate(-90 24 24)">
              {data.map((d, i) => {
                const dash = dashes[i]
                const segOffset = offsets[i]
                return (
                  <circle
                    key={d.label}
                    cx="24"
                    cy="24"
                    r={r}
                    fill="none"
                    stroke={strokeClass[d.color] ?? '#8a0cd2'}
                    strokeWidth="8"
                    strokeDasharray={`${dash} ${c - dash}`}
                    strokeDashoffset={-segOffset}
                    strokeLinecap="butt"
                  />
                )
              })}
            </g>
            <circle cx="24" cy="24" r="12" fill="#fff" />
            <text
              x="24"
              y="24"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="6"
              fill="#1f1233"
              fontWeight="700"
            >
              {Math.round((data[0]?.value / total) * 100)}%
            </text>
            <text
              x="24"
              y="30"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="4"
              fill="rgba(31,18,51,0.62)"
            >
              principal
            </text>
          </svg>
        </div>

        <div className="grid gap-2">
          {data.map((d) => (
            <div
              key={d.label}
              className="flex items-center justify-between gap-3 rounded-2xl border border-purple-200/50 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'h-3 w-3 rounded-full',
                    swatchClass[d.color] ?? 'bg-purple-700',
                  ].join(' ')}
                  aria-hidden="true"
                />
                <div className="text-sm font-semibold text-slate-900">
                  {d.label}
                </div>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {d.value}
              </div>
            </div>
          ))}
          <div className="pt-1 text-xs text-slate-500">
            Total: {total}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminHome() {
  const now = useMemo(() => new Date(), [])
  const year = now.getFullYear()
  const periodStart = useMemo(() => new Date(year - 1, 11, 1), [year])
  const periodEnd = useMemo(() => new Date(year, 11, 0), [year])
  const months = useMemo(() => getPeriodMonths(now), [now])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sociosActivos, setSociosActivos] = useState(0)
  const [prestamosActivos, setPrestamosActivos] = useState(0)
  const [activeInvested, setActiveInvested] = useState(0)
  const [monthlyAhorro, setMonthlyAhorro] = useState(() =>
    months.map((m, i) => ({
      label: m.label,
      fullLabel: m.fullLabel,
      value: 0,
      tone: i % 3 === 0 ? 'pink' : 'purple',
    })),
  )
  const [pie, setPie] = useState([
    { label: 'Abonos', value: 0, color: 'purple' },
    { label: 'Préstamos aprobados', value: 0, color: 'pink' },
    { label: 'Préstamos pendientes', value: 0, color: 'purple2' },
    { label: 'Préstamos rechazados', value: 0, color: 'pink2' },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const from = isoDate(periodStart)
    const to = isoDate(periodEnd)

    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const nextMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    const currentPeriodDate = isoDate(currentMonthStart)

    const [
      sociosRes,
      abonosRes,
      prestamosApprovedRes,
      abonosMesRes,
      prestamosMesRes,
      activitiesRes,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'socio')
        .or('is_active.is.null,is_active.eq.true'),
      supabase
        .from('abonos')
        .select('period_date, amount')
        .eq('status', 'approved')
        .gte('period_date', from)
        .lte('period_date', to),
      supabase
        .from('prestamos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved'),
      supabase
        .from('abonos')
        .select('amount')
        .eq('status', 'approved')
        .eq('period_date', currentPeriodDate),
      supabase
        .from('prestamos')
        .select('status')
        .gte('created_at', currentMonthStart.toISOString())
        .lt('created_at', nextMonthStart.toISOString()),
      supabase
        .from('activities')
        .select('invested_amount')
        .neq('is_active', false)
    ])

    const anyError =
      sociosRes.error ||
      abonosRes.error ||
      prestamosApprovedRes.error ||
      abonosMesRes.error ||
      prestamosMesRes.error ||
      activitiesRes.error

    if (anyError) {
      const err = sociosRes.error || abonosRes.error || prestamosApprovedRes.error || abonosMesRes.error || prestamosMesRes.error || activitiesRes.error
      const extra = [err.code, err.hint].filter(Boolean).join(' · ')
      setError(extra ? `${err.message} (${extra})` : err.message)
    }

    setSociosActivos(sociosRes.count ?? 0)
    setPrestamosActivos(prestamosApprovedRes.count ?? 0)

    const activeActInvested = (activitiesRes.data ?? []).reduce((acc, a) => acc + Number(a.invested_amount || 0), 0)
    setActiveInvested(activeActInvested)

    const monthTotals = new Map()
    for (const r of abonosRes.data ?? []) {
      const key = String(r.period_date ?? '')
      const prev = monthTotals.get(key) ?? 0
      monthTotals.set(key, prev + Number(r.amount || 0))
    }

    setMonthlyAhorro(
      months.map((m, i) => ({
        label: m.label,
        fullLabel: m.fullLabel,
        value: monthTotals.get(m.periodDate) ?? 0,
        tone: i % 3 === 0 ? 'pink' : 'purple',
      })),
    )

    const abonosMesCount = (abonosMesRes.data ?? []).length
    const prestMes = prestamosMesRes.data ?? []
    const prestamosApprovedMes = prestMes.filter((r) => r.status === 'approved').length
    const prestamosPendingMes = prestMes.filter((r) => r.status === 'pending').length
    const prestamosRejectedMes = prestMes.filter((r) => r.status === 'rejected').length

    setPie([
      { label: 'Abonos aprobados', value: abonosMesCount, color: 'purple' },
      { label: 'Préstamos aprobados', value: prestamosApprovedMes, color: 'pink' },
      { label: 'Préstamos pendientes', value: prestamosPendingMes, color: 'purple2' },
      { label: 'Préstamos rechazados', value: prestamosRejectedMes, color: 'pink2' },
    ])

    setLoading(false)
  }, [months, periodEnd, periodStart])

  useEffect(() => {
    const t = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(t)
  }, [load])

  const totalAhorrado = useMemo(() => Math.max(0, monthlyAhorro.reduce((acc, d) => acc + d.value, 0) - activeInvested), [monthlyAhorro, activeInvested])
  const ahorroMes = monthlyAhorro.at(-1)?.value ?? 0

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Control rápido de socios, abonos, préstamos y actividades.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Socios"
          value={loading ? '—' : String(sociosActivos)}
          hint="Activos"
          to="/admin/socios"
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          accent="purple"
        />
        <MetricCard
          title="Total ahorrado"
          value={loading ? '—' : formatCop(totalAhorrado)}
          hint={`Mes actual: ${loading ? '—' : formatCop(ahorroMes)}`}
          to="/admin/abonos"
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          accent="pink"
        />
        <MetricCard
          title="Préstamos"
          value={loading ? '—' : String(prestamosActivos)}
          hint="Activos"
          to="/admin/prestamos"
          icon={<HandCoins className="h-5 w-5" aria-hidden="true" />}
          accent="purple"
        />
        <MetricCard
          title="Actividades"
          value="2"
          hint="Próximas"
          to="/admin/actividades"
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
          accent="pink"
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <LineChart
          title="Ahorro por mes"
          rangeLabel={`Dic ${year - 1} – Nov ${year}`}
          data={monthlyAhorro}
        />
        <PieChart title="Distribución" data={pie} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
          <div className="text-sm font-bold text-slate-900">
            Total ahorrado por mes
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Dic {year - 1} – Nov {year}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {monthlyAhorro.map((m) => (
              <div
                key={m.fullLabel}
                className="flex items-center justify-between gap-3 rounded-2xl border border-purple-200/50 bg-white px-3 py-2"
              >
                <div className="truncate text-sm font-semibold text-slate-900">
                  {m.fullLabel}
                </div>
                <div className="text-sm font-extrabold text-slate-900">
                  {formatCop(m.value)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
          <div className="text-sm font-bold text-slate-900">Resumen</div>
          <div className="mt-3 grid gap-2">
            <div className="rounded-2xl bg-purple-50 px-3 py-2 ring-1 ring-purple-200/60">
              <div className="text-xs font-semibold text-purple-700">Ahorro total</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {formatCop(totalAhorrado)}
              </div>
            </div>
            <div className="rounded-2xl bg-pink-50 px-3 py-2 ring-1 ring-pink-200/70">
              <div className="text-xs font-semibold text-pink-600">Ahorro mes actual</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {formatCop(ahorroMes)}
              </div>
            </div>
            <div className="rounded-2xl border border-purple-200/50 bg-white px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">
                Nota
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                El ahorro mensual se calcula con abonos Aprobados del periodo Dic {year - 1} – Nov {year}.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
