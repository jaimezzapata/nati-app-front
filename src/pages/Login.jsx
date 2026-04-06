import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Mail, Phone, User } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

const debugSupabase = import.meta.env.VITE_DEBUG_SUPABASE === 'true'

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function isValidColMobileLocal(phone) {
  return /^\d{10}$/.test(phone)
}

function emailFromPhone(phone) {
  return `${phone}@nati.local`
}

export default function Login() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sex, setSex] = useState('O')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()

  const fromPath = useMemo(() => {
    const from = location.state?.from?.pathname
    return typeof from === 'string' && from.length > 0 ? from : '/dashboard'
  }, [location.state])

  const formMode = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('mode') === 'register' ? 'register' : 'login'
  }, [location.search])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      if (!data.session) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('user_id', data.session.user.id)
        .single()

      if (!active) return

      if (profile?.is_active === false) {
        await supabase.auth.signOut()
        setError('Tu usuario está desactivado. Contacta al administrador.')
        return
      }

      if (profile?.role === 'admin') navigate('/admin', { replace: true })
      else navigate(fromPath, { replace: true })
    })

    return () => {
      active = false
    }
  }, [fromPath, navigate])

  function goTo(mode) {
    setError('')
    setLoading(false)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    const next = mode === 'register' ? '/login?mode=register' : '/login'
    navigate(next, { replace: true, state: location.state })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const normalizedPhone = normalizePhone(phone)
    const email = emailFromPhone(normalizedPhone)

    if (debugSupabase) {
      console.groupCollapsed('[login] submit')
      console.log('raw phone:', phone)
      console.log('normalized phone:', normalizedPhone)
      console.log('email used:', email)
      console.groupEnd()
    }

    if (!isValidColMobileLocal(normalizedPhone)) {
      setError('El usuario debe ser un número de celular colombiano de 10 dígitos')
      return
    }
    if (!password) {
      setError('La contraseña es obligatoria')
      return
    }

    setLoading(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      if (debugSupabase) {
        console.groupCollapsed('[login] signInWithPassword error')
        console.log('status:', signInError.status)
        console.log('code:', signInError.code)
        console.log('message:', signInError.message)
        console.log('full error:', signInError)
        console.groupEnd()
      }
      setLoading(false)
      setError(signInError.message)
      return
    }

    if (debugSupabase) {
      console.groupCollapsed('[login] signInWithPassword ok')
      console.log('user id:', data.user?.id)
      console.log('user email:', data.user?.email)
      console.groupEnd()
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', data.user.id)
      .single()

    setLoading(false)

    if (profileError) {
      setError(profileError.message)
      return
    }

    if (profile?.is_active === false) {
      await supabase.auth.signOut()
      setError('Tu usuario está desactivado. Contacta al administrador.')
      return
    }

    if (profile?.role === 'admin') navigate('/admin', { replace: true })
    else navigate(fromPath, { replace: true })
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError('')

    const normalizedPhone = normalizePhone(phone)
    const email = emailFromPhone(normalizedPhone)
    const contactEmail = String(email).trim()

    if (!isValidColMobileLocal(normalizedPhone)) {
      setError('El usuario debe ser un número de celular colombiano de 10 dígitos')
      return
    }
    if (!String(fullName).trim()) {
      setError('El nombre es obligatorio')
      return
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(String(contactEmail))) {
      setError('Ingresa un correo válido')
      return
    }
    if (!password) {
      setError('La contraseña es obligatoria')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener mínimo 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    const sexValid = ['F', 'M', 'O'].includes(String(sex))
    if (!sexValid) {
      setError('Selecciona un género válido')
      return
    }

    setLoading(true)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          phone: normalizedPhone,
          role: 'socio',
           full_name: String(fullName).trim(),
           sex: String(sex),
           contact_email: contactEmail,
        },
      },
    })

    if (signUpError) {
      setLoading(false)
      setError(signUpError.message)
      return
    }

    const userId = data.user?.id
    if (!userId) {
      setLoading(false)
      setError('No se pudo completar el registro (usuario no creado)')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', userId)
      .single()

    await supabase
      .from('profiles')
      .update({
        full_name: String(fullName).trim(),
        sex: String(sex),
        role: 'socio',
        phone: normalizedPhone,
      })
      .eq('user_id', userId)

    setLoading(false)

    if (profileError) {
      setError(profileError.message)
      return
    }

    if (profile?.is_active === false) {
      await supabase.auth.signOut()
      setError('Tu usuario está desactivado. Contacta al administrador.')
      return
    }

    if (profile?.role === 'admin') navigate('/admin', { replace: true })
    else navigate(fromPath, { replace: true })
  }

  return (
    <div className="min-h-[100svh] bg-purple-50 px-4">
      <div className="flex min-h-[100svh] items-center py-10">
        <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-purple-200/60">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-purple-50 text-purple-700">
              {formMode === 'register' ? (
                <User className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Phone className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {formMode === 'register' ? 'Crear cuenta' : 'Ingresar'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Usuario: celular colombiano sin indicativo (10 dígitos)
          </p>
        </div>

        <form
          onSubmit={formMode === 'register' ? handleRegister : handleSubmit}
          className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-200/60"
        >
          <div className="grid gap-4">
            {formMode === 'register' ? (
              <label className="grid gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Nombre completo
                </span>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    className="h-11 w-full rounded-xl border border-purple-200/60 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    placeholder="Nombre y apellido"
                  />
                </div>
              </label>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-medium text-slate-500">
                Usuario
              </span>
              <div className="relative">
                <Phone
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder="3001234567"
                />
              </div>
            </label>

            {formMode === 'register' ? (
              <label className="grid gap-2">
                <span className="text-xs font-medium text-slate-500">Correo</span>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    className="h-11 w-full rounded-xl border border-purple-200/60 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </label>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-medium text-slate-500">
                Contraseña
              </span>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white pl-10 pr-12 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={formMode === 'register' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-slate-500 transition hover:bg-purple-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-purple-200"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </label>

            {formMode === 'register' ? (
              <label className="grid gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Confirmar contraseña
                </span>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    className="h-11 w-full rounded-xl border border-purple-200/60 bg-white pl-10 pr-12 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-slate-500 transition hover:bg-purple-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-purple-200"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </label>
            ) : null}

            {formMode === 'register' ? (
              <label className="grid gap-2">
                <span className="text-xs font-medium text-slate-500">Género</span>
                <select
                  className="h-11 w-full rounded-xl border border-purple-200/60 bg-white px-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-200"
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                >
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="O">Otro</option>
                </select>
              </label>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded-xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:opacity-60"
            >
              {formMode === 'register'
                ? loading
                  ? 'Creando…'
                  : 'Crear cuenta'
                : loading
                ? 'Ingresando…'
                : 'Entrar'}
            </button>

            <div className="text-center text-sm text-slate-500">
              {formMode === 'register' ? (
                <>
                  ¿Ya tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => goTo('login')}
                    className="font-semibold text-purple-700 underline-offset-2 hover:underline"
                  >
                    Inicia sesión
                  </button>
                </>
              ) : (
                <>
                  ¿No tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => goTo('register')}
                    className="font-semibold text-purple-700 underline-offset-2 hover:underline"
                  >
                    Regístrate
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
      </div>
    </div>
  )
}
