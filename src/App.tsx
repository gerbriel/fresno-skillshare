import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireMember, RequireAdmin } from './components/Protected'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import PendingApproval from './pages/PendingApproval'
import Feed from './pages/Feed'
import Categories from './pages/Categories'
import CategoryDetail from './pages/CategoryDetail'
import Profile from './pages/Profile'
import ListingEditor from './pages/ListingEditor'
import Messages from './pages/Messages'
import Leaderboard from './pages/Leaderboard'
import Trades from './pages/Trades'
import Newsletters from './pages/Newsletters'
import Admin from './pages/admin/Admin'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/pending" element={<PendingApproval />} />

          <Route element={<RequireMember />}>
            <Route element={<Layout />}>
              <Route path="/feed" element={<Feed />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/categories/:slug" element={<CategoryDetail />} />
              <Route path="/u/:id" element={<Profile />} />
              <Route path="/listings/new" element={<ListingEditor />} />
              <Route path="/listings/:id/edit" element={<ListingEditor />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:threadId" element={<Messages />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/trades" element={<Trades />} />
              <Route path="/news" element={<Newsletters />} />
            </Route>
          </Route>

          <Route element={<RequireAdmin />}>
            <Route element={<Layout />}>
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
