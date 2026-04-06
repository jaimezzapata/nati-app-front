import { useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import AbonosGrid from '../../components/AbonosGrid.jsx'

export default function AdminAbonos() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [people, setPeople] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')

  const selected = useMemo(
    () => people.find((s) => s.user_id === selectedUserId) ?? null,
    [people, selectedUserId],
  )

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (!active) return

      if (sessionError) {
        setLoading(false)
        setError(sessionError.message)
        return
      }

      const session = sessionData.session
      if (!session) {
        setLoading(false)
        setError('No hay sesión activa')
        return
      }

      const [sociosRes, meRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, full_name, phone, is_active')
          .eq('role', 'socio')
          .or('is_active.is.null,is_active.eq.true')
          .order('full_name', { ascending: true }),
        supabase
          .from('profiles')
          .select('user_id, full_name, phone')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ])

      if (!active) return

      if (sociosRes.error) {
        setLoading(false)
        setError(sociosRes.error.message)
        return
      }

      if (meRes.error) {
        setLoading(false)
        setError(meRes.error.message)
        return
      }

      const me = meRes.data
        ? {
            user_id: meRes.data.user_id,
            full_name: meRes.data.full_name ? `Yo (Admin) · ${meRes.data.full_name}` : 'Yo (Admin)',
            phone: meRes.data.phone ?? '—',
          }
        : { user_id: session.user.id, full_name: 'Yo (Admin)', phone: '—' }

      const socios = sociosRes.data ?? []
      const combined = [me, ...socios.filter((s) => s.user_id !== me.user_id)]

      setPeople(combined)
      setSelectedUserId((prev) => prev || me.user_id)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Gestionar Abonos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registra abonos manuales y gestiona solicitudes. Dos por mes (Q1 y Q2).
        </p>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Users className="h-4 w-4 text-purple-700" aria-hidden="true" />
            Persona
          </div>
          <select
            className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={loading}
          >
            {people.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {(s.full_name || 'Sin nombre') + ' — ' + (s.phone ?? '—')}
              </option>
            ))}
          </select>
        </div>

        {selected ? (
          <div className="mt-3 text-xs font-semibold text-slate-500">
            Seleccionado:{' '}
            <span className="text-slate-900">
              {selected.full_name || 'Sin nombre'} ({selected.phone})
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
          {error}
        </div>
      ) : null}

      {selectedUserId ? <div className="mt-3"><AbonosGrid mode="admin" userId={selectedUserId} /></div> : null}
    </div>
  )
}
