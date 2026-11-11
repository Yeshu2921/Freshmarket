
import "./Sidebar.css";
import { useNotifications } from "../context/NotificationContext";

const menus = {
  owner: [
    { label: "Dashboard", icon: "bi-speedometer2" },
    { label: "User Management", icon: "bi-people" },
    { label: "Products", icon: "bi-box-seam" },
    { label: "Categories", icon: "bi-grid" },
    { label: "Brands", icon: "bi-tags" },
    { label: "Online Orders", icon: "bi-bag-check" },
    { label: "Inventory", icon: "bi-clipboard-data" },
    { label: "Reports", icon: "bi-bar-chart" },
    { label: "Messages", icon: "bi-chat-dots" },
    { label: "Settings", icon: "bi-gear" },
  ],

  worker: [
    { label: "Dashboard", icon: "bi-speedometer2" },
    { label: "Products", icon: "bi-box-seam" },
    { label: "Online Orders", icon: "bi-bag-check" },
    { label: "Sales History", icon: "bi-clock-history" },
    { label: "Messages", icon: "bi-chat-dots" },
  ],
};

function Sidebar({
  role = "",
  activePage = "Dashboard",
  onNavigate,
  open = false,
  onClose,
  collapsed = false,
}) {
  const { unreadMessagesCount } = useNotifications();

  const normalizedRole = String(role).trim().toLowerCase();
  const roleMenus = menus[normalizedRole] || [];

  const roleTitle =
    normalizedRole === "owner"
      ? "OWNER"
      : normalizedRole === "worker"
        ? "WORKER"
        : "USER";

  function handleNavigation(label) {
    onNavigate?.(label);
    onClose?.();
  }

  return (
    <>
      {open && (
        <button
          type="button"
          className="fm-sidebar-overlay"
          aria-label="Close navigation menu"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          "fm-sidebar",
          open ? "fm-sidebar-open" : "",
          collapsed ? "fm-sidebar-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={`${roleTitle} sidebar`}
      >
        <div className="fm-sidebar-brand">
          <div className="fm-sidebar-logo">F</div>

          <div className="fm-sidebar-brand-text">
            <h5>FreshMart</h5>
            <span>Supermarket System</span>
          </div>
        </div>

        <div className="fm-sidebar-section">
          <span>MAIN MENU</span>
          <span className="fm-sidebar-role">{roleTitle}</span>
        </div>

        <nav
          className="fm-sidebar-nav"
          aria-label={`${normalizedRole || "user"} navigation`}
        >
          {roleMenus.map((item) => {
            const isActive = activePage === item.label;
            const isMessages = item.label === "Messages";

            return (
              <button
                type="button"
                key={item.label}
                className={`fm-sidebar-link ${
                  isActive ? "active" : ""
                }`}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                onClick={() => handleNavigation(item.label)}
              >
                <i className={`bi ${item.icon}`} aria-hidden="true" />

                <span className="fm-sidebar-link-text">
                  {item.label}
                </span>

                {isMessages && unreadMessagesCount > 0 && (
                  <span
                    className="fm-sidebar-message-count"
                    aria-label={`${unreadMessagesCount} unread messages`}
                  >
                    {unreadMessagesCount > 99
                      ? "99+"
                      : unreadMessagesCount}
                  </span>
                )}

                {isActive && (
                  <span
                    className="fm-sidebar-active-dot"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}

          {roleMenus.length === 0 && (
            <p className="fm-sidebar-empty">
              No navigation items are available for this role.
            </p>
          )}
        </nav>

        <div className="fm-sidebar-bottom">
          <div className="fm-sidebar-help-icon">
            <i className="bi bi-shield-check" aria-hidden="true" />
          </div>

          <strong>FreshMart System</strong>
          <p>Supermarket management</p>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
