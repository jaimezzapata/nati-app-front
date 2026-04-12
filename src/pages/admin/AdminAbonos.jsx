import { useEffect, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import AbonosGrid from '../../components/AbonosGrid.jsx'

export default function AdminAbonos() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [people, setPeople] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => people.find((s) => s.user_id === selectedUserId) ?? null,
    [people, selectedUserId],
  )

  const filteredPeople = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => {
      const name = String(p.full_name || '').toLowerCase()
      const phone = String(p.phone || '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    })
  }, [people, query])

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

      {error ? (
        <div role="alert" className="mt-3 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-slate-900">
          {error}
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-purple-700" aria-hidden="true" />
              Personas
            </div>
            {selected ? (
              <div className="text-xs font-semibold text-slate-500">
                <span className="text-slate-900">{selected.full_name || 'Sin nombre'}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-2 rounded-2xl border border-purple-200/60 bg-white px-3 py-2 shadow-sm focus-within:ring-4 focus-within:ring-purple-200">
              <Search className="h-4 w-4 text-purple-700" aria-hidden="true" />
              <input
                className="h-7 w-full bg-transparent text-sm outline-none"
                placeholder="Buscar por nombre o teléfono…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {loading ? (
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-2xl bg-purple-50 ring-1 ring-purple-200/60" />
              ))}
            </div>
          ) : filteredPeople.length ? (
            <div className="mt-4 max-h-[70vh] overflow-auto pr-1">
              <div className="grid gap-2">
                {filteredPeople.map((p) => {
                  const isActive = p.user_id === selectedUserId
                  return (
                    <button
                      key={p.user_id}
                      type="button"
                      onClick={() => setSelectedUserId(p.user_id)}
                      className={[
                        'w-full rounded-2xl border px-3 py-2 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-purple-200',
                        isActive
                          ? 'border-purple-300 bg-purple-50'
                          : 'border-purple-200/60 bg-white hover:bg-purple-50',
                      ].join(' ')}
                    >
                      <div className="truncate text-sm font-extrabold text-slate-900">{p.full_name || 'Sin nombre'}</div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">{p.phone ?? '—'}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-purple-50 px-3 py-3 text-sm text-slate-700 ring-1 ring-purple-200/60">
              No hay resultados con ese filtro.
            </div>
          )}
        </div>

        <div>
          {selectedUserId ? <AbonosGrid mode="admin" userId={selectedUserId} /> : null}
        </div>
      </div>
    </div>
  )
}
