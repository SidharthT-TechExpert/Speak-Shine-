import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { lazy, Suspense, useState, useEffect } from "react";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
const ChatLauncher = lazy(() => import("./components/ChatLauncher.jsx"));
const InstallPrompt = lazy(() => import("./components/InstallPrompt.jsx"));
const WakeUpScreen  = lazy(() => import("./components/WakeUpScreen.jsx"));

// Lazy-load all pages — each becomes its own JS chunk, only loaded when needed
const Login           = lazy(() => import("./pages/Login.jsx"));
const Register        = lazy(() => import("./pages/Register.jsx"));
const ForgotPassword  = lazy(() => import("./pages/ForgotPassword.jsx"));
const UserDashboard   = lazy(() => import("./pages/UserDashboard.jsx"));
const AdminDashboard  = lazy(() => import("./pages/AdminDashboard.jsx"));
const TrainerDashboard= lazy(() => import("./pages/TrainerDashboard.jsx"));
const VideoAnalysis   = lazy(() => import("./pages/VideoAnalysis.jsx"));
const CommunityFeed   = lazy(() => import("./pages/CommunityFeed.jsx"));
const LiveSession     = lazy(() => import("./pages/LiveSession.jsx"));
const NotFound        = lazy(() => import("./pages/NotFound.jsx"));

function PageLoader() {
  return (
    <div className="spinner-wrap" style={{ height: "100vh" }}>
      <div className="spinner" />
    </div>
  );
}

// Redirect logged-in users away from auth pages
function GuestRoute({ children, loginFor }) {
  const { user } = useAuth();
  if (!user) return children;
  if (loginFor === "admin"   && user.role === "admin")                                    return <Navigate to="/admin"     replace />;
  if (loginFor === "trainer" && ["trainer","admin"].includes(user.role))                  return <Navigate to="/trainer"   replace />;
  if (user.role === "admin")   return <Navigate to="/admin"     replace />;
  if (user.role === "trainer") return <Navigate to="/trainer"   replace />;
  if (user.role === "viewer")  return <Navigate to="/admin"     replace />;
  return <Navigate to="/dashboard" replace />;
}

// Protect routes — redirect to login if not authenticated or wrong role
function ProtectedRoute({ children, roles, loginPath = "/login" }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={loginPath} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

// Root redirect based on role
function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin")   return <Navigate to="/admin"     replace />;
  if (user.role === "trainer") return <Navigate to="/trainer"   replace />;
  if (user.role === "viewer")  return <Navigate to="/admin"     replace />;
  return <Navigate to="/dashboard" replace />;
}

// Hide ChatLauncher on live session pages
function ChatLauncherConditional() {
  const location = useLocation();
  if (location.pathname.startsWith("/live/")) return null;
  return <ChatLauncher />;
}

export default function App() {
  // null = checking, false = server sleeping, true = ready
  const [serverReady, setServerReady] = useState(null);

  useEffect(() => {
    const BASE = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
      : "";

    fetch(`${BASE}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    })
      .then(r => { if (r.ok) setServerReady(true); else setServerReady(false); })
      .catch(() => setServerReady(false)); // server sleeping — show WakeUpScreen
  }, []);

  // Still checking (< 4s) — show nothing, avoids flash of wake-up screen
  if (serverReady === null) {
    return (
      <div style={{ background: "#05050f", minHeight: "100vh" }}>
        <div className="initial-loader" />
      </div>
    );
  }

  if (!serverReady) {
    return <Suspense fallback={<PageLoader />}><WakeUpScreen onReady={() => setServerReady(true)} /></Suspense>;
  }

  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
            {/* Root */}
            <Route path="/" element={<HomeRedirect />} />

            {/* User auth */}
            <Route path="/login" element={
              <GuestRoute loginFor="user"><Login /></GuestRoute>
            } />
            {/* /register — open to guests, redirects logged-in users away */}
            <Route path="/register" element={
              <GuestRoute loginFor="user"><Register /></GuestRoute>
            } />
            {/* Forgot password — open to all (phone OTP verification required) */}
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Admin auth */}
            <Route path="/admin/login" element={
              <GuestRoute loginFor="admin"><Login loginFor="admin" /></GuestRoute>
            } />

            {/* Trainer auth */}
            <Route path="/trainer/login" element={
              <GuestRoute loginFor="trainer"><Login loginFor="trainer" /></GuestRoute>
            } />

            {/* Protected pages */}
            <Route path="/dashboard" element={
              <ProtectedRoute roles={["user","admin","trainer"]} loginPath="/login">
                <UserDashboard />
              </ProtectedRoute>
            } />
            <Route path="/video-analysis" element={
              <ProtectedRoute roles={["user","admin","trainer"]} loginPath="/login">
                <VideoAnalysis />
              </ProtectedRoute>
            } />
            <Route path="/record" element={
              <ProtectedRoute roles={["user","admin","trainer"]} loginPath="/login">
                <VideoAnalysis />
              </ProtectedRoute>
            } />
            <Route path="/community" element={
              <ProtectedRoute roles={["user","admin","trainer"]} loginPath="/login">
                <CommunityFeed />
              </ProtectedRoute>
            } />
            <Route path="/live/:id" element={
              <ProtectedRoute roles={["user","admin","trainer"]} loginPath="/login">
                <LiveSession />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute roles={["admin", "viewer"]} loginPath="/admin/login">
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/trainer" element={
              <ProtectedRoute roles={["trainer","admin","viewer"]} loginPath="/trainer/login">
                <TrainerDashboard />
              </ProtectedRoute>
            } />

            {/* Catch-all - 404 Page */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </Suspense>
            <Suspense fallback={null}><ChatLauncherConditional /></Suspense>
            <Suspense fallback={null}><InstallPrompt /></Suspense>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
