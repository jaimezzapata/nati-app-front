import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

export default function Abonos() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active) return

      if (sessionError) {
        setError(sessionError.message)
        setLoading(false)
        return
      }

      if (!data.session) {
        setError('No hay sesión activa')
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', data.session.user.id)
        .single()

      if (!active) return

      if (profile?.role === 'admin') navigate('/admin/abonos', { replace: true })
      else navigate('/socio/abonos', { replace: true })
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [navigate])

  if (loading) {
    return (
      <div className="min-h-[100svh] bg-purple-50 px-4 py-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="h-[170px] animate-pulse rounded-3xl bg-white ring-1 ring-purple-200/50" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100svh] bg-purple-50 px-4 py-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Abonos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Envía tus solicitudes de abono. Dos por mes (Q1 y Q2).
          </p>
        </div>

        {error ? (
          <div role="alert" className="rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
