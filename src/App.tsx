import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireMember, RequireAdmin } from './components/Protected'
import Layout from './components/Layout'
import Landing from './pages/Landing'

// Landing stays eager (first paint for visitors); everything else is
// code-split so the public bundle stays small.
const Auth = lazy(() => import('./pages/Auth'))
const PendingApproval = lazy(() => import('./pages/PendingApproval'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const Feed = lazy(() => import('./pages/Feed'))
const Categories = lazy(() => import('./pages/Categories'))
const CategoryDetail = lazy(() => import('./pages/CategoryDetail'))
const Profile = lazy(() => import('./pages/Profile'))
const ListingEditor = lazy(() => import('./pages/ListingEditor'))
const Messages = lazy(() => import('./pages/Messages'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const Trades = lazy(() => import('./pages/Trades'))
const Events = lazy(() => import('./pages/Events'))
const Newsletters = lazy(() => import('./pages/Newsletters'))
const Admin = lazy(() => import('./pages/admin/Admin'))

function PageFallback() {
  return <p className="py-10 text-center text-sm text-stone-500">Loading...</p>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

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
                <Route path="/events" element={<Events />} />
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
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
