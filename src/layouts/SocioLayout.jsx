import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { CalendarDays, HandCoins, Home, LogOut, Menu, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

function getInitials(name, fallback) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  const initials = parts.map((p) => p[0]).join('')
  if (initials) return initials.toUpperCase()
  return String(fallback ?? '').slice(-2).toUpperCase() || 'NA'
}

function NavItem({ to, end, icon, children, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition',
          'focus:outline-none focus:ring-4 focus:ring-purple-200',
          isActive ? 'bg-purple-50 text-purple-700' : 'text-slate-900 hover:bg-purple-50',
        ].join(' ')
      }
    >
      <span
        className={[
          'grid h-9 w-9 place-items-center rounded-2xl border border-purple-200/60 bg-white text-purple-700 shadow-sm transition',
          'group-hover:border-purple-200',
        ].join(' ')}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </NavLink>
  )
}

export default function SocioLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const initials = useMemo(
    () => getInitials(profile?.full_name, profile?.phone),
    [profile?.full_name, profile?.phone],
  )

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (!active) return

      if (sessionError) {
        setError(sessionError.message)
        setLoading(false)
        return
      }

      const session = sessionData.session
      if (!session) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('phone, role, full_name, is_active')
        .eq('user_id', session.user.id)
        .single()

      if (!active) return

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

      if (profileData?.is_active === false) {
        await supabase.auth.signOut()
        navigate('/login', { replace: true })
        return
      }

      setProfile(profileData)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [navigate])

  async function handleLogout() {
    await supabase.auth.signOut()
    setDrawerOpen(false)
    navigate('/login', { replace: true })
  }

  const onNavigate = () => setDrawerOpen(false)

  if (loading) {
    return (
      <div className="min-h-[100svh] bg-purple-50 px-4 py-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/60">
            <div className="h-4 w-32 animate-pulse rounded-full bg-purple-100" />
            <div className="mt-4 grid gap-2">
              <div className="h-3 w-full animate-pulse rounded-full bg-purple-100" />
              <div className="h-3 w-5/6 animate-pulse rounded-full bg-purple-100" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[100svh] bg-purple-50 px-4 py-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/60">
            <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
            <div role="alert" className="mt-3 rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900">
              {error}
            </div>
            <div className="mt-4">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
                type="button"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (profile?.role === 'admin') return <Navigate to="/admin" replace />
  if (profile?.role !== 'socio') return <Navigate to="/login" replace />

  return (
    <div className="min-h-[100svh] bg-purple-50 md:grid md:grid-cols-[280px_1fr]">
      <div
        className={[
          'fixed inset-0 z-20 bg-black/40 transition',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          'md:hidden',
        ].join(' ')}
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        className={[
          'fixed left-0 top-0 z-30 flex h-[100svh] w-[min(86vw,320px)] flex-col bg-white shadow-xl ring-1 ring-purple-200/50 transition-transform',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          'md:sticky md:translate-x-0 md:shadow-none md:ring-0 md:border-r md:border-purple-200/50 md:w-auto',
        ].join(' ')}
        aria-label="Navegación socio"
      >
        <div className="flex items-center justify-between px-4 py-4 md:py-5">
          <div className="grid">
            <div className="text-sm font-extrabold tracking-tight text-slate-900">Natillera</div>
            <div className="text-xs text-slate-500">Socio</div>
          </div>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200 md:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 rounded-3xl border border-purple-200/60 bg-white px-3 py-3 shadow-sm">
            <div className="grid h-11 w-11 place-items-center rounded-3xl bg-purple-50 text-purple-700">
              <span className="text-sm font-extrabold">{initials}</span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">{profile?.full_name || 'Socio'}</div>
              <div className="truncate text-xs text-slate-500">{profile?.phone}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 px-3 pb-4">
          <nav className="grid gap-1">
            <NavItem to="/socio" end icon={<Home className="h-4 w-4" aria-hidden="true" />} onNavigate={onNavigate}>
              Home
            </NavItem>
            <NavItem to="/socio/abonos" icon={<Wallet className="h-4 w-4" aria-hidden="true" />} onNavigate={onNavigate}>
              Abonos
            </NavItem>
            <NavItem to="/socio/actividades" icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />} onNavigate={onNavigate}>
              Actividades
            </NavItem>
            <NavItem to="/socio/prestamos" icon={<HandCoins className="h-4 w-4" aria-hidden="true" />} onNavigate={onNavigate}>
              Solicitud de préstamos
            </NavItem>
          </nav>
        </div>

        <div className="mt-auto px-3 pb-5">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
          >
            <span className="grid h-9 w-9 place-items-center rounded-2xl border border-pink-200 bg-white text-pink-600 shadow-sm" aria-hidden="true">
              <LogOut className="h-4 w-4" />
            </span>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-10 border-b border-purple-200/50 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setDrawerOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-purple-200/60 bg-white text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="text-sm font-extrabold tracking-tight text-slate-900">Panel</div>

          <div className="flex items-center gap-2">
            <Link
              to="/socio"
              className="grid h-11 w-11 place-items-center rounded-2xl border border-purple-200/60 bg-white text-purple-700 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              aria-label="Ir al Home"
            >
              <Home className="h-5 w-5" aria-hidden="true" />
            </Link>

            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-50 text-purple-700">
              <span className="text-sm font-extrabold">{initials}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-5 hidden items-center justify-end md:flex">
            <Link
              to="/socio"
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-purple-700 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              aria-label="Ir al Home"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Home
            </Link>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
