
import { useState } from "react";

import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import Footer from "../components/Footer";

import OwnerDashboard from "../owner/pages/OwnerDashboard";
import UserManagement from "../owner/pages/UserManagement";
import BrandManagement from "../owner/pages/BrandManagement";
import CategoryManagement from "../owner/pages/CategoryManagement";
import ProductManagement from "../owner/pages/ProductManagement";
import Inventory from "../owner/pages/Inventory";
import OwnerOnlineOrders from "../owner/pages/OwnerOnlineOrders";
import OwnerReports from "../owner/pages/OwnerReports";
import OwnerSettings from "../owner/pages/OwnerSettings";

import Messages from "../components/messages/Messages";

import "./OwnerLayout.css";

function OwnerLayout({ name = "Owner", user, onLogout }) {
  const [activePage, setActivePage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  function toggleSidebar() {
    if (window.matchMedia("(min-width: 992px)").matches) {
      setSidebarCollapsed((previous) => !previous);
    } else {
      setSidebarOpen((previous) => !previous);
    }
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function handleNavigate(page) {
    setActivePage(page);
    setSidebarOpen(false);

    // Manual Messages navigation opens the contact list.
    if (page === "Messages") {
      setSelectedConversationId(null);
    }
  }

  // Handle notification clicks.
  function handleNotificationNavigate(notification) {
    const type = notification.notification_type;

    if (type === "new_order" || type === "order_update") {
      setActivePage("Online Orders");
      setSelectedConversationId(null);
    }

    if (type === "new_message") {
      setSelectedConversationId(notification.reference_id || null);
      setActivePage("Messages");
    }

    setSidebarOpen(false);
  }

  function renderActivePage() {
    switch (activePage) {
      case "Dashboard":
        return <OwnerDashboard />;

      case "User Management":
        return <UserManagement />;

      case "Categories":
        return <CategoryManagement />;

      case "Brands":
        return <BrandManagement />;

      case "Products":
        return <ProductManagement />;

      case "Inventory":
        return <Inventory />;

      case "Online Orders":
        return <OwnerOnlineOrders />;

      case "Reports":
        return <OwnerReports />;

      case "Settings":
        return <OwnerSettings />;

      case "Messages":
        return (
          <Messages
            currentUser={user}
            initialConversationId={selectedConversationId}
          />
        );

      default:
        return (
          <div className="owner-page-placeholder">
            <div className="owner-placeholder-icon">
              <i className="bi bi-window-stack" aria-hidden="true" />
            </div>

            <h3>{activePage}</h3>

            <p>
              This page is selected. Its content can be connected here.
            </p>
          </div>
        );
    }
  }

  return (
    <div
      className={`owner-layout ${
        sidebarCollapsed ? "owner-sidebar-collapsed" : ""
      }`}
    >
      <Header
        role="owner"
        name={name}
        user={user}
        onToggleSidebar={toggleSidebar}
        onLogout={onLogout}
        onNotificationNavigate={handleNotificationNavigate}
      />

      <Sidebar
        role="owner"
        activePage={activePage}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />

      <main className="owner-main-content">
        <div className="owner-page-content">
          {renderActivePage()}
        </div>

        <Footer />
      </main>
    </div>
  );
}

export default OwnerLayout;
