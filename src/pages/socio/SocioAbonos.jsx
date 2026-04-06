import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import AbonosGrid from '../../components/AbonosGrid.jsx'

export default function SocioAbonos() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')

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

      setUserId(data.session.user.id)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
        <div className="h-4 w-32 animate-pulse rounded-full bg-purple-100" />
        <div className="mt-4 grid gap-2">
          <div className="h-3 w-full animate-pulse rounded-full bg-purple-100" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-purple-100" />
        </div>
      </div>
    )
  }

  return (
    <div>
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

      {userId ? <AbonosGrid mode="socio" userId={userId} /> : null}
    </div>
  )
}

