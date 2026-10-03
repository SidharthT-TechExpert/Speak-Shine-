import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import CustomCursor from "./components/CustomCursor.jsx";
const HelpDeskWidget = lazy(() => import("./components/HelpDeskWidget.jsx"));
const InstallPrompt = lazy(() => import("./components/InstallPrompt.jsx"));
const WakeUpScreen  = lazy(() => import("./components/WakeUpScreen.jsx"));

// Lazy-load all pages with preloading support
const pageImports = {
  Login: () => import("./pages/Login.jsx"),
  Register: () => import("./pages/Register.jsx"),
  ForgotPassword: () => import("./pages/ForgotPassword.jsx"),
  UserDashboard: () => import("./pages/UserDashboard.jsx"),
  AdminDashboard: () => import("./pages/AdminDashboard.jsx"),
  TrainerDashboard: () => import("./pages/TrainerDashboard.jsx"),
  VideoAnalysis: () => import("./pages/VideoAnalysis.jsx"),
  CommunityFeed: () => import("./pages/CommunityFeed.jsx"),
  LiveSession: () => import("./pages/LiveSession.jsx"),
  LiveRooms: () => import("./pages/LiveRooms.jsx"),
  NotFound: () => import("./pages/NotFound.jsx"),
  PaymentWall: () => import("./pages/PaymentWall.jsx"),
  PaymentHistory: () => import("./pages/PaymentHistory.jsx"),
  Profile: () => import("./pages/Profile.jsx"),
};

const Login           = lazy(pageImports.Login);
const Register        = lazy(pageImports.Register);
const ForgotPassword  = lazy(pageImports.ForgotPassword);
const UserDashboard   = lazy(pageImports.UserDashboard);
const AdminDashboard  = lazy(pageImports.AdminDashboard);
const TrainerDashboard= lazy(pageImports.TrainerDashboard);
const VideoAnalysis   = lazy(pageImports.VideoAnalysis);
const CommunityFeed   = lazy(pageImports.CommunityFeed);
const LiveSession     = lazy(pageImports.LiveSession);
const LiveRooms       = lazy(pageImports.LiveRooms);
const NotFound        = lazy(pageImports.NotFound);
const PaymentWall     = lazy(pageImports.PaymentWall);
const PaymentHistory  = lazy(pageImports.PaymentHistory);
const Profile         = lazy(pageImports.Profile);

export const routePreloaders = {
  "/dashboard": pageImports.UserDashboard,
  "/record": pageImports.VideoAnalysis,
  "/video-analysis": pageImports.VideoAnalysis,
  "/community": pageImports.CommunityFeed,
  "/live/rooms": pageImports.LiveRooms,
  "/payment": pageImports.PaymentWall,
  "/payment-history": pageImports.PaymentHistory,
  "/profile": pageImports.Profile,
  "/admin": pageImports.AdminDashboard,
  "/trainer": pageImports.TrainerDashboard,
};

export function preloadRoute(path) {
  if (!path) return;
  const loader = routePreloaders[path];
  if (loader) loader();
}

import { AppShell } from "./components/Layout.jsx";

function PageLoader() {
  return (
    <div className="spinner-wrap" style={{ height: "100vh" }}>
      <div className="spinner" />
    </div>
  );
}

export function PageContentLoader() {
  return (
    <div
      className="speakshine-page-transition"
      style={{
        width: "100%",
        padding: "0.25rem 0 2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      {/* Top Header Row Skeleton */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1, minWidth: 220 }}>
          <div className="speakshine-shimmer-box" style={{ width: "210px", height: "26px" }} />
          <div className="speakshine-shimmer-box" style={{ width: "320px", height: "14px", opacity: 0.6 }} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          <div className="speakshine-shimmer-box" style={{ width: "95px", height: "34px", borderRadius: "99px" }} />
          <div className="speakshine-shimmer-box" style={{ width: "105px", height: "34px", borderRadius: "99px" }} />
        </div>
      </div>

      {/* Hero Grid Skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
        {/* Main Mission Card Skeleton */}
        <div
          className="speakshine-shimmer-box"
          style={{
            minHeight: "260px",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div style={{ width: "120px", height: "22px", borderRadius: "99px", background: "rgba(139,92,246,0.22)" }} />
            <div style={{ width: "75%", height: "26px", borderRadius: "8px", background: "rgba(255,255,255,0.12)" }} />
            <div style={{ width: "92%", height: "16px", borderRadius: "6px", background: "rgba(255,255,255,0.06)" }} />
          </div>
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px", height: "44px", borderRadius: "12px", background: "rgba(139,92,246,0.25)" }} />
            <div style={{ width: "130px", height: "44px", borderRadius: "12px", background: "rgba(255,255,255,0.08)" }} />
          </div>
        </div>

        {/* Secondary Info Card Skeleton */}
        <div
          className="speakshine-shimmer-box"
          style={{
            minHeight: "260px",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div style={{ width: "150px", height: "18px", borderRadius: "6px", background: "rgba(255,255,255,0.12)" }} />
            <div style={{ width: "100%", height: "86px", borderRadius: "12px", background: "rgba(255,255,255,0.05)" }} />
          </div>
          <div style={{ width: "100%", height: "46px", borderRadius: "12px", background: "rgba(251,191,36,0.16)" }} />
        </div>
      </div>

      {/* Stat Grid Skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div className="speakshine-shimmer-box" style={{ height: "95px", border: "1px solid var(--border)" }} />
        <div className="speakshine-shimmer-box" style={{ height: "95px", border: "1px solid var(--border)" }} />
        <div className="speakshine-shimmer-box" style={{ height: "95px", border: "1px solid var(--border)" }} />
      </div>
    </div>
  );
}

// Redirect logged-in users away from auth pages
function GuestRoute({ children, loginFor }) {
  const { user } = useAuth();
  if (!user) return children;
  if (loginFor === "admin"   && (user.role === "admin" || user.role === "admins"))        return <Navigate to="/admin"     replace />;
  if (loginFor === "trainer" && ["trainer","admin","admins"].includes(user.role))         return <Navigate to="/trainer"   replace />;
  if (user.role === "admin")   return <Navigate to="/admin"     replace />;
  if (user.role === "admins")  return <Navigate to="/admin"     replace />;
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
  if (!user) return <Navigate to="/dashboard" replace />;  // guests see preview
  if (user.role === "admin")   return <Navigate to="/admin"     replace />;
  if (user.role === "admins")  return <Navigate to="/admin"     replace />;
  if (user.role === "trainer") return <Navigate to="/trainer"   replace />;
  if (user.role === "viewer")  return <Navigate to="/admin"     replace />;
  return <Navigate to="/dashboard" replace />;
}

import { isMonthlyGracePeriod } from "./utils/gracePeriodUtils.js";

// Block unpaid users from accessing video/analysis pages — show payment wall instead.
// Admins, trainers, and viewers bypass the gate at all times.
// Initial 2 days of each month (1st & 2nd in IST) are open to all users without payment.
function PaidRoute({ children }) {
  const { user } = useAuth();
  // Guests can view and try in preview mode (submitting prompts to register)
  if (!user) return children;
  const bypass = ["admin", "admins", "trainer", "viewer"].includes(user.role);
  if (bypass) return children;
  if (isMonthlyGracePeriod()) return children;
  if (!user.paid) return <PaymentWall />;
  return children;
}

// Hide HelpDeskWidget on live session interactive rooms (keep on /live/rooms directory)
function HelpDeskWidgetConditional() {
  const location = useLocation();
  if (location.pathname.startsWith("/live/") && location.pathname !== "/live/rooms") return null;
  return <HelpDeskWidget />;
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
      .then(r => { if (r.ok || r.status === 429) setServerReady(true); else setServerReady(false); })
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
    <ThemeProvider>
      <CustomCursor />
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppRoutes />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// Automatically check account status on route transition if user is logged in
function RouteAccountGuard() {
  const location = useLocation();
  const { user, verifyAccountStatus } = useAuth();
  const lastPathRef = useRef(null);

  useEffect(() => {
    if (user && verifyAccountStatus && !location.pathname.startsWith("/login")) {
      if (lastPathRef.current !== location.pathname) {
        lastPathRef.current = location.pathname;
        verifyAccountStatus();
      }
    }
  }, [location.pathname, user, verifyAccountStatus]);

  return null;
}

// Wait for the proactive boot token refresh before rendering protected UI,
// so requests + socket never fire with an expired token.
function AppRoutes() {
  const { booting } = useAuth();
  if (booting) return <PageLoader />;

  return (
    <BrowserRouter>
      <RouteAccountGuard />
      <Routes>
        {/* User auth */}
        <Route path="/login" element={
          <GuestRoute loginFor="user"><Suspense fallback={<PageLoader />}><Login /></Suspense></GuestRoute>
        } />
        {/* /register — open to guests, redirects logged-in users away */}
        <Route path="/register" element={
          <GuestRoute loginFor="user"><Suspense fallback={<PageLoader />}><Register /></Suspense></GuestRoute>
        } />
        {/* Forgot password — open to all (phone OTP verification required) */}
        <Route path="/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />

        {/* Admin auth */}
        <Route path="/admin/login" element={
          <GuestRoute loginFor="admin"><Suspense fallback={<PageLoader />}><Login loginFor="admin" /></Suspense></GuestRoute>
        } />

        {/* Trainer auth */}
        <Route path="/trainer/login" element={
          <GuestRoute loginFor="trainer"><Suspense fallback={<PageLoader />}><Login loginFor="trainer" /></Suspense></GuestRoute>
        } />

        {/* Live session full-screen interactive room (no sidebar/header) */}
        <Route path="/live/:id" element={
          <ProtectedRoute roles={["user","admin","admins","trainer"]} loginPath="/login">
            <Suspense fallback={<PageLoader />}><LiveSession /></Suspense>
          </ProtectedRoute>
        } />

        {/* Persistent App Shell with Sticky Header & Sidebar */}
        <Route element={<AppShell />}>
          {/* Root */}
          <Route path="/" element={<HomeRedirect />} />

          {/* Protected pages — guests see preview mode, logged-in users see real data */}
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/video-analysis" element={
            <PaidRoute><VideoAnalysis /></PaidRoute>
          } />
          <Route path="/record" element={
            <PaidRoute><VideoAnalysis /></PaidRoute>
          } />
          <Route path="/community" element={<CommunityFeed />} />
          <Route path="/live/rooms" element={
            <ProtectedRoute roles={["user","admin","admins","trainer","viewer"]} loginPath="/login">
              <LiveRooms />
            </ProtectedRoute>
          } />
          <Route path="/payment" element={<PaymentWall />} />
          <Route path="/payment-history" element={
            <ProtectedRoute roles={["user","admin","admins","trainer"]} loginPath="/login">
              <PaymentHistory />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute roles={["user","admin","admins","trainer","viewer"]} loginPath="/login">
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute roles={["admin", "admins", "viewer"]} loginPath="/admin/login">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/trainer" element={
            <ProtectedRoute roles={["trainer","admin","admins","viewer"]} loginPath="/trainer/login">
              <TrainerDashboard />
            </ProtectedRoute>
          } />
        </Route>

        {/* Catch-all - 404 Page */}
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
      </Routes>
      <Suspense fallback={null}><HelpDeskWidgetConditional /></Suspense>
      <Suspense fallback={null}><InstallPrompt /></Suspense>
    </BrowserRouter>
  );
}
