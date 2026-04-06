import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

function SocioDashboard({ profile, onLogout }) {
  return (
    <div className="min-h-[100svh] bg-purple-50 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bienvenido. Aquí verás tu estado en la natillera.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
          <div className="text-sm font-semibold text-slate-900">
            Tu información
          </div>
          <div className="mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
            <div className="text-xs font-medium text-slate-500">
              Usuario
            </div>
            <div className="text-slate-900">{profile?.phone ?? '—'}</div>
            <div className="text-xs font-medium text-slate-500">
              Nombre
            </div>
            <div className="text-slate-900">
              {profile?.full_name ?? '—'}
            </div>
            <div className="text-xs font-medium text-slate-500">Rol</div>
            <div className="text-slate-900">{profile?.role ?? '—'}</div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Link
              to="/abonos"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
            >
              Ver abonos
            </Link>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-purple-200/60 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-purple-50 focus:outline-none focus:ring-4 focus:ring-purple-200"
              type="button"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
          <div className="text-sm font-semibold text-slate-900">
            Próximamente
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Estado de abonos, cuotas pendientes, historial y notificaciones.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

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

      if (!sessionData.session) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('phone, role, full_name')
        .eq('user_id', sessionData.session.user.id)
        .single()

      if (!active) return

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

      setProfile(profileData)
      setLoading(false)

      if (profileData?.role === 'admin') {
        navigate('/admin', { replace: true })
        return
      }
      navigate('/socio', { replace: true })
    }

    load()

    return () => {
      active = false
    }
  }, [navigate])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-[100svh] bg-purple-50 px-4 py-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
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
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <div
              role="alert"
              className="mt-3 rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
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

  if (profile?.role === 'admin') return null
  if (profile?.role === 'socio') return null

  return <SocioDashboard profile={profile} onLogout={handleLogout} />
}
