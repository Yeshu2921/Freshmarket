import { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import "./MainLayout.css";

function MainLayout({
  children,
  role = "owner",
  userName = "FreshMart User",
  activePage = "Dashboard",
  onNavigate,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="fm-layout">
      <Header
        role={role}
        userName={userName}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      <div className="fm-layout-body">
        <Sidebar
          role={role}
          activePage={activePage}
          onNavigate={onNavigate}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="fm-layout-main">
          <main className="fm-page-content">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  );
}

export default MainLayout;