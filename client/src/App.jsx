
import { useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import HomePage from "./pages/HomePage";
import AllPublicProducts from "./pages/AllPublicProducts";
import Cart from "./pages/Cart";
import OwnerLogin from "./pages/OwnerLogin";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

import HomeLayout from "./layouts/HomeLayout";
import workerLayout from "./layouts/WorkerLayout";
import OwnerLayout from "./layouts/OwnerLayout";
import NotFound from "./components/NotFound";
import OrderPage from "./pages/OrderPage";
import YourOrders from "./pages/YourOrders";
import About from "./pages/About";
import Contact from "./pages/Contact";

import { NotificationProvider } from "./context/NotificationContext";

import "./App.css";

// =============================================
// PROTECTED ROUTE
// =============================================

function ProtectedRoute({ currentUser, requiredRole, children }) {
  const token = sessionStorage.getItem("freshmartToken");

  if (!token || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.role !== requiredRole) {
    if (currentUser.role === "owner") {
      return <Navigate to="/owner/dashboard" replace />;
    }

    if (currentUser.role === "worker") {
      return <Navigate to="/worker/dashboard" replace />;
    }

    return <Navigate to="/login" replace />;
  }

  return children;
}

// =============================================
// APP
// =============================================

function App() {
  const navigate = useNavigate();

  // Restore logged-in user after browser refresh.
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = sessionStorage.getItem("freshmartUser");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      sessionStorage.removeItem("freshmartUser");
      return null;
    }
  });

  const displayName =
    currentUser?.name ||
    currentUser?.full_name ||
    currentUser?.username ||
    [currentUser?.first_name, currentUser?.last_name]
      .filter(Boolean)
      .join(" ") ||
    "User";

  // =============================================
  // LOGIN
  // =============================================

  function handleLogin(user, token) {
    if (!user || !token) {
      console.error("Login failed: user or token is missing.");
      return;
    }

    if (!["owner", "worker"].includes(user.role)) {
      console.error(
        "This login page supports owner and worker accounts only."
      );
      return;
    }

    sessionStorage.setItem("freshmartToken", token);
    sessionStorage.setItem("freshmartUser", JSON.stringify(user));

    setCurrentUser(user);

    if (user.role === "owner") {
      navigate("/owner/dashboard", { replace: true });
    } else {
      navigate("/worker/dashboard", { replace: true });
    }
  }

  // =============================================
  // LOGOUT
  // =============================================

  function handleLogout() {
    sessionStorage.removeItem("freshmartToken");
    sessionStorage.removeItem("freshmartUser");

    setCurrentUser(null);
    navigate("/login", { replace: true });
  }

  // =============================================
  // DASHBOARD PATH
  // =============================================

  function getDashboardPath() {
    return currentUser?.role === "owner"
      ? "/owner/dashboard"
      : "/worker/dashboard";
  }

  // =============================================
  // APPLICATION ROUTES
  // =============================================

  return (
    <NotificationProvider user={currentUser}>
      <Routes>
        {/* PUBLIC PAGES */}
        <Route element={<HomeLayout />}>
          <Route path="/" element={<HomePage />} />

          <Route
            path="/market"
            element={<AllPublicProducts />}
          />
       <Route path="/about" element={<About />} />
       <Route path="/contact" element={<Contact />} />
          <Route path="/order" element={<OrderPage />} />

          <Route path="/your-orders" element={<YourOrders />} />

          <Route path="/cart" element={<Cart />} />
        </Route>

        {/* LOGIN */}
        <Route
          path="/login"
          element={
            currentUser &&
            sessionStorage.getItem("freshmartToken") ? (
              <Navigate to={getDashboardPath()} replace />
            ) : (
              <OwnerLogin onLogin={handleLogin} />
            )
          }
        />

        {/* PASSWORD RECOVERY */}
        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />

        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />

        {/* OWNER */}
        <Route
          path="/owner/dashboard"
          element={
            <ProtectedRoute
              currentUser={currentUser}
              requiredRole="owner"
            >
              <OwnerLayout
                name={displayName}
                user={currentUser}
                onLogout={handleLogout}
              />
            </ProtectedRoute>
          }
        />

        {/* WORKER */}
        <Route
          path="/worker/*"
          element={
            <ProtectedRoute
              currentUser={currentUser}
              requiredRole="worker"
            >
              <WorkerLayout
                name={displayName}
                user={currentUser}
                onLogout={handleLogout}
              />
            </ProtectedRoute>
          }
        />

        {/* UNKNOWN URL */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </NotificationProvider>
  );
}

export default App;
