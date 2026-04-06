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

function emailFromPhone(phone) {
  return `${phone}@nati.local`
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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

