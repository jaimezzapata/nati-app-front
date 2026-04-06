import { Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import AdminLayout from './layouts/AdminLayout.jsx'
import AdminHome from './pages/admin/AdminHome.jsx'
import AdminSection from './pages/admin/AdminSection.jsx'
import AdminProfile from './pages/admin/AdminProfile.jsx'
import AdminSocios from './pages/admin/AdminSocios.jsx'
import AdminAbonos from './pages/admin/AdminAbonos.jsx'
import Abonos from './pages/Abonos.jsx'
import SocioLayout from './layouts/SocioLayout.jsx'
import SocioAbonos from './pages/socio/SocioAbonos.jsx'
import SocioPrestamos from './pages/socio/SocioPrestamos.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/abonos" element={<Abonos />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route path="socios" element={<AdminSocios />} />
          <Route path="abonos" element={<AdminAbonos />} />
          <Route path="prestamos" element={<AdminSection section="prestamos" />} />
          <Route path="actividades" element={<AdminSection section="actividades" />} />
          <Route path="perfil" element={<AdminProfile />} />
        </Route>
        <Route path="/socio" element={<SocioLayout />}>
          <Route index element={<Navigate to="/socio/abonos" replace />} />
          <Route path="abonos" element={<SocioAbonos />} />
          <Route path="prestamos" element={<SocioPrestamos />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
