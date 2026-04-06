import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const adminPhone = (process.env.ADMIN_PHONE ?? '3001234567').replace(/\D/g, '')
const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin123456'
const socioPhone = (process.env.SOCIO_PHONE ?? '3011234567').replace(/\D/g, '')
const socioPassword = process.env.SOCIO_PASSWORD ?? 'Socio123456'

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 10)
}

function emailFromPhone(phone) {
  return `${phone}@nati.local`
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function parseArgs(argv) {
  const args = []
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) flags[key] = true
      else {
        flags[key] = next
        i += 1
      }
    } else args.push(a)
  }
  return { args, flags }
}

async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (error) throw error
  return data.users.find((u) => u.email === email) ?? null
}

async function getOrCreateUser({ phone, password, role, fullName }) {
  const email = emailFromPhone(phone)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, role, full_name: fullName },
  })

  if (!error) return data.user

  if (!String(error.message ?? '').toLowerCase().includes('already')) {
    throw error
  }

  const existing = await findUserByEmail(email)
  if (!existing) throw error

  const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
    existing.id,
    { user_metadata: { phone, role, full_name: fullName } },
  )
  if (updateError) throw updateError

  return updated.user
}

async function findProfileByPhone(phone) {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, phone, full_name, role')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

async function updateUserPhone({ userId, oldPhone, newPhone }) {
  const normalizedNew = normalizePhone(newPhone)
  const normalizedOld = oldPhone ? normalizePhone(oldPhone) : ''

  if (!normalizedNew || normalizedNew.length !== 10) {
    throw new Error('NEW_PHONE debe tener 10 dígitos (celular COL sin indicativo)')
  }

  let targetUserId = userId ? String(userId) : ''
  if (!targetUserId) {
    if (!normalizedOld || normalizedOld.length !== 10) {
      throw new Error('OLD_PHONE debe tener 10 dígitos (celular COL sin indicativo) o envía --user-id')
    }
    const profile = await findProfileByPhone(normalizedOld)
    if (!profile?.user_id) {
      const fallback = await findUserByEmail(emailFromPhone(normalizedOld))
      if (!fallback?.id) throw new Error(`No se encontró usuario con phone=${normalizedOld}`)
      targetUserId = fallback.id
    } else {
      targetUserId = profile.user_id
    }
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(targetUserId)
  if (userError) throw userError
  if (!userData?.user) throw new Error(`No se encontró usuario por id=${targetUserId}`)

  const newEmail = emailFromPhone(normalizedNew)

  const existingByEmail = await findUserByEmail(newEmail)
  if (existingByEmail && existingByEmail.id !== targetUserId) {
    throw new Error(`Ya existe otro usuario con email=${newEmail} (phone=${normalizedNew})`)
  }

  const { data: profileByNew, error: profileByNewError } = await supabase
    .from('profiles')
    .select('user_id, phone')
    .eq('phone', normalizedNew)
    .maybeSingle()
  if (profileByNewError) throw profileByNewError
  if (profileByNew?.user_id && profileByNew.user_id !== targetUserId) {
    throw new Error(`Ya existe otro perfil con phone=${normalizedNew}`)
  }

  const nextMetadata = { ...(userData.user.user_metadata ?? {}), phone: normalizedNew }
  const { error: updateAuthError } = await supabase.auth.admin.updateUserById(targetUserId, {
    email: newEmail,
    email_confirm: true,
    user_metadata: nextMetadata,
  })
  if (updateAuthError) throw updateAuthError

  const { error: updateProfileError } = await supabase
    .from('profiles')
    .update({ phone: normalizedNew })
    .eq('user_id', targetUserId)
  if (updateProfileError) throw updateProfileError

  console.log('Actualización completada')
  console.log('user_id:', targetUserId)
  console.log('old_phone:', normalizedOld || '(por user-id)')
  console.log('new_phone:', normalizedNew)
  console.log('new_login_email:', newEmail)
}

async function getOrCreateNatillera({ name, createdBy }) {
  const { data: existing, error: selectError } = await supabase
    .from('natilleras')
    .select('id')
    .eq('name', name)
    .maybeSingle()

  if (selectError) throw selectError
  if (existing?.id) return existing.id

  const { data: inserted, error: insertError } = await supabase
    .from('natilleras')
    .insert({
      name,
      start_date: new Date().toISOString().slice(0, 10),
      periodicity: 'mensual',
      contribution_amount: 50000,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (insertError) throw insertError
  return inserted.id
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'update-phone') {
    const { args, flags } = parseArgs(rest)
    const oldPhone = flags.old ?? args[0]
    const newPhone = flags.new ?? args[1]
    const userId = flags['user-id']
    await updateUserPhone({ userId, oldPhone, newPhone })
    return
  }

  if (adminPhone.length !== 10 || socioPhone.length !== 10) {
    throw new Error('ADMIN_PHONE y SOCIO_PHONE deben tener 10 dígitos (celular COL sin indicativo)')
  }

  const adminUser = await getOrCreateUser({
    phone: adminPhone,
    password: adminPassword,
    role: 'admin',
    fullName: 'Admin Demo',
  })

  const socioUser = await getOrCreateUser({
    phone: socioPhone,
    password: socioPassword,
    role: 'socio',
    fullName: 'Socio Demo',
  })

  const natilleraId = await getOrCreateNatillera({
    name: 'Natillera Demo',
    createdBy: adminUser.id,
  })

  const { error: memberError } = await supabase.from('natillera_members').upsert([
    { natillera_id: natilleraId, user_id: adminUser.id },
    { natillera_id: natilleraId, user_id: socioUser.id },
  ])

  if (memberError) throw memberError

  console.log('Seed completado')
  console.log('Admin:', adminPhone, adminPassword)
  console.log('Socio:', socioPhone, socioPassword)
  console.log('Natillera ID:', natilleraId)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
