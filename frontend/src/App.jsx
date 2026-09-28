import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { lazy, Suspense, useState, useEffect } from "react";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import CustomCursor from "./components/CustomCursor.jsx";
const ChatLauncher = lazy(() => import("./components/ChatLauncher.jsx"));
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
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "55vh",
      padding: "2rem",
      gap: "1rem",
    }}>
      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
      <span style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 600 }}>
        Loading page content...
      </span>
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

// Hide ChatLauncher on live session interactive rooms (keep on /live/rooms directory)
function ChatLauncherConditional() {
  const location = useLocation();
  if (location.pathname.startsWith("/live/") && location.pathname !== "/live/rooms") return null;
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

// Wait for the proactive boot token refresh before rendering protected UI,
// so requests + socket never fire with an expired token.
function AppRoutes() {
  const { booting } = useAuth();
  if (booting) return <PageLoader />;

  return (
    <BrowserRouter>
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
      <Suspense fallback={null}><ChatLauncherConditional /></Suspense>
      <Suspense fallback={null}><InstallPrompt /></Suspense>
    </BrowserRouter>
  );
}
