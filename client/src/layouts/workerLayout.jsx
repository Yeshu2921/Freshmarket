
import { useState, useEffect } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import Footer from "../components/Footer";

import WorkerDashboard from "../worker/pages/workerDashboard";
import WorkerProducts from "../worker/pages/WorkerProducts";
import WorkerOnlineOrders from "../worker/pages/WorkerOnlineOrders";
import WorkerSalesHistory from "../worker/pages/WorkerSalesHistory";

import Messages from "../components/messages/Messages";

import "./workerLayout.css";

function WorkerLayout({ name = "Worker", onLogout, user }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pageRoutes = {
    "/worker/dashboard": "Dashboard",
    "/worker/products": "Products",
    "/worker/orders": "Online Orders",
    "/worker/sales-history": "Sales History",
    "/worker/messages": "Messages",
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const activePage = pageRoutes[location.pathname] || "Dashboard";

  function handleNavigate(page) {
    const routes = {
      Dashboard: "/worker/dashboard",
      Products: "/worker/products",
      "Online Orders": "/worker/orders",
      "Sales History": "/worker/sales-history",
      Messages: "/worker/messages",
    };

    if (routes[page]) {
      navigate(routes[page]);
    }
  }

  // Handle notification clicks.
  function handleNotificationNavigate(notification) {
    const type = notification.notification_type;

    if (type === "new_order" || type === "order_update") {
      navigate("/worker/orders");
      return;
    }

    if (type === "new_message") {
      navigate("/worker/messages", {
        state: {
          conversationId: notification.reference_id || null,
        },
      });
    }
  }

  function renderPage() {
    switch (location.pathname) {
      case "/worker/dashboard":
        return <WorkerDashboard name={name} />;

      case "/worker/products":
        return <WorkerProducts />;

      case "/worker/orders":
        return <WorkerOnlineOrders />;

      case "/worker/sales-history":
        return <WorkerSalesHistory />;

      case "/worker/messages":
        return (
          <Messages
            currentUser={user}
            initialConversationId={
              location.state?.conversationId || null
            }
          />
        );

      case "/worker":
      case "/worker/":
        return <Navigate to="/worker/dashboard" replace />;

      default:
        return <Navigate to="/worker/dashboard" replace />;
    }
  }

  return (
    <div
      className={`worker-layout ${
        sidebarCollapsed ? "worker-layout-collapsed" : ""
      }`}
    >
      <Sidebar
        role="worker"
        activePage={activePage}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />

      <div className="worker-layout-main">
        <Header
          role="worker"
          name={name}
          user={user}
          onToggleSidebar={() => {
            if (window.innerWidth < 992) {
              setSidebarOpen((previous) => !previous);
            } else {
              setSidebarCollapsed((previous) => !previous);
            }
          }}
          onLogout={onLogout}
          onNotificationNavigate={handleNotificationNavigate}
        />

        <main className="worker-layout-content">
          {renderPage()}
        </main>

        <Footer />
      </div>
    </div>
  );
}

export default WorkerLayout;
