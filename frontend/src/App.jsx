import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { lazy, Suspense } from "react";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import ChatLauncher from "./components/ChatLauncher.jsx";
import InstallPrompt from "./components/InstallPrompt.jsx";

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

export default function App() {
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
            {/* /register is disabled — admin creates members from the dashboard */}
            <Route path="/register" element={<Navigate to="/login" replace />} />
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
            <ChatLauncher />
            <InstallPrompt />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
