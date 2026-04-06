import { Link } from 'react-router-dom'
import { HandCoins, Wallet } from 'lucide-react'

function Card({ title, description, to, icon }) {
  return (
    <Link
      to={to}
      className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-purple-200/50 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-purple-200 focus:outline-none focus:ring-4 focus:ring-purple-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{description}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-200/70">
          {icon}
        </div>
      </div>
    </Link>
  )
}

export default function SocioHome() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-slate-500">
          Accede a tus abonos y solicitudes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          title="Abonos"
          description="Registra tus solicitudes (Q1 y Q2) y revisa aprobaciones."
          to="/socio/abonos"
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
        />
        <Card
          title="Solicitud de préstamos"
          description="Solicita un préstamo y revisa el estado."
          to="/socio/prestamos"
          icon={<HandCoins className="h-5 w-5" aria-hidden="true" />}
        />
      </div>
    </div>
  )
}

