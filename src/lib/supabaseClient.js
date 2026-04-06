import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const debugSupabase = import.meta.env.VITE_DEBUG_SUPABASE === 'true'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno: VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY',
  )
}

function redact(value) {
  const str = String(value ?? '')
  if (str.length <= 12) return `${str.slice(0, 3)}…`
  return `${str.slice(0, 4)}…${str.slice(-4)}`
}

async function loggingFetch(input, init) {
  const url = typeof input === 'string' ? input : input.url
  const method = init?.method ?? 'GET'
  const headers = new Headers(init?.headers ?? {})
  const apikey = headers.get('apikey')
  const authorization = headers.get('authorization')

  const shouldLog =
    debugSupabase &&
    (String(url).includes('/auth/v1/') || String(url).includes('/rest/v1/'))

  if (shouldLog) {
    console.groupCollapsed('[supabase] request', method, url)
    console.log('apikey:', apikey ? redact(apikey) : '(missing)')
    console.log('authorization:', authorization ? redact(authorization) : '(missing)')
    console.log('content-type:', headers.get('content-type') ?? '(none)')
    console.groupEnd()
  }

  const res = await fetch(input, init)

  if (shouldLog) {
    const ok = res.ok
    const status = res.status
    const statusText = res.statusText

    console.groupCollapsed('[supabase] response', status, statusText, method, url)
    console.log('ok:', ok)
    if (!ok) {
      try {
        const cloned = res.clone()
        const contentType = cloned.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const body = await cloned.json()
          console.log('error body:', body)
        } else {
          const text = await cloned.text()
          console.log('error text:', text.slice(0, 2000))
        }
      } catch (e) {
        console.log('no body (or could not read):', e)
      }
    }
    console.groupEnd()
  }

  return res
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: debugSupabase ? { fetch: loggingFetch } : undefined,
})
