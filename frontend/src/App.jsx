import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import UserDashboard from "./pages/UserDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import TrainerDashboard from "./pages/TrainerDashboard.jsx";
import VideoAnalysis from "./pages/VideoAnalysis.jsx";

// Redirect logged-in users away from auth pages
function GuestRoute({ children, loginFor }) {
  const { user } = useAuth();
  if (!user) return children;
  if (loginFor === "admin"   && user.role === "admin")                              return <Navigate to="/admin"     replace />;
  if (loginFor === "trainer" && ["trainer","admin"].includes(user.role))            return <Navigate to="/trainer"   replace />;
  if (user.role === "admin")   return <Navigate to="/admin"     replace />;
  if (user.role === "trainer") return <Navigate to="/trainer"   replace />;
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
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Root */}
          <Route path="/" element={<HomeRedirect />} />

          {/* User auth */}
          <Route path="/login" element={
            <GuestRoute loginFor="user"><Login showRegister /></GuestRoute>
          } />
          <Route path="/register" element={
            <GuestRoute loginFor="user"><Register /></GuestRoute>
          } />

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
          <Route path="/admin" element={
            <ProtectedRoute roles={["admin"]} loginPath="/admin/login">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/trainer" element={
            <ProtectedRoute roles={["trainer","admin"]} loginPath="/trainer/login">
              <TrainerDashboard />
            </ProtectedRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
