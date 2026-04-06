import { useEffect, useState } from 'react'
import { Check, Save } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'

export default function AdminProfile() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      setSuccess('')

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
        setError('No hay sesión activa')
        setLoading(false)
        return
      }

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('phone, role, full_name')
        .eq('user_id', session.user.id)
        .single()

      if (!active) return
      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

      setProfile(data)
      setFullName(data?.full_name ?? '')
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()

    if (sessionError) {
      setSaving(false)
      setError(sessionError.message)
      return
    }

    const session = sessionData.session
    if (!session) {
      setSaving(false)
      setError('No hay sesión activa')
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null })
      .eq('user_id', session.user.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Perfil actualizado')
  }

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
        <div className="h-4 w-40 animate-pulse rounded-full bg-purple-100" />
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
        <h1 className="text-2xl font-semibold tracking-tight">Editar Perfil</h1>
        <p className="mt-1 text-sm text-slate-500">
          Actualiza tu información básica.
        </p>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50">
        <div className="text-sm font-bold text-slate-900">Tu cuenta</div>
        <div className="mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
          <div className="text-xs font-medium text-slate-500">Usuario</div>
          <div className="text-slate-900">{profile?.phone}</div>
          <div className="text-xs font-medium text-slate-500">Rol</div>
          <div className="text-slate-900">{profile?.role}</div>
        </div>
      </div>

      <form
        className="mt-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/50"
        onSubmit={handleSave}
      >
        <div className="text-sm font-bold text-slate-900">Información</div>

        <label className="mt-4 grid gap-2">
          <span className="text-xs font-medium text-slate-500">
            Nombre completo
          </span>
          <input
            className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
          />
        </label>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-pink-300 bg-white px-3 py-2 text-sm"
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-100 px-3 py-2 text-sm font-semibold text-purple-700">
            <Check className="h-4 w-4" aria-hidden="true" />
            {success}
          </div>
        ) : null}

        <div className="mt-4">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
