
import { useEffect, useMemo, useState } from "react";
import { Dropdown, Form, InputGroup } from "react-bootstrap";
import MyProfile from "../components/MyProfile";
import "./Header.css";

const API_ORIGIN = "http://localhost:5134";
const API_BASE = `${API_ORIGIN}/api`;

function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem("freshmartUser") || "null");
  } catch {
    return null;
  }
}

function getPhotoUrl(path) {
  if (!path) return "";

  if (/^(https?:\/\/|data:|blob:)/i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}/${String(path).replace(/^\/+/, "")}`;
}

function Header({
  role = "owner",
  name = "Owner",
  onToggleSidebar,
  onLogout,
  notifications = [],
  unreadCount,
  user: userProp,
  onUserUpdated,
}) {
  const [searchValue, setSearchValue] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [storedUser, setStoredUser] = useState(getStoredUser);
  const [photoFailed, setPhotoFailed] = useState(false);

  // Website logo
  const [logo, setLogo] = useState(null);

  // Load stored user
  useEffect(() => {
    setStoredUser(getStoredUser());
  }, []);

  // Load the logo managed from Owner Settings
  useEffect(() => {
    const controller = new AbortController();

    async function fetchLogo() {
      try {
        const response = await fetch(`${API_BASE}/homepage/logo`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load website logo.");
        }

        const data = await response.json();

        setLogo(data.logo || null);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.warn("Homepage logo could not be loaded:", error);
          setLogo(null);
        }
      }
    }

    fetchLogo();

    return () => controller.abort();
  }, []);

  const user = userProp || storedUser || {};

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.name ||
    name ||
    "User";

  const displayRole = user.role || role;

  const roleLabel =
    displayRole.charAt(0).toUpperCase() + displayRole.slice(1);

  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  const photoUrl = useMemo(
    () => getPhotoUrl(user.profile_image),
    [user.profile_image]
  );

  const logoUrl = useMemo(
    () => getPhotoUrl(logo?.image_path),
    [logo?.image_path]
  );

  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);

  const unread = Number.isFinite(Number(unreadCount))
    ? Math.max(0, Number(unreadCount))
    : notifications.filter(
        (item) => !item.read && !item.is_read
      ).length;

  function handleUserUpdated(updatedUser) {
    const nextUser = { ...user, ...updatedUser };

    sessionStorage.setItem("freshmartUser", JSON.stringify(nextUser));
    setStoredUser(nextUser);
    setPhotoFailed(false);

    if (onUserUpdated) {
      onUserUpdated(nextUser);
    }
  }

  function Avatar({ large = false }) {
    return (
      <span
        className={`fm-avatar ${large ? "fm-avatar-large" : ""}`}
        aria-label={`${displayName}'s profile`}
      >
        {photoUrl && !photoFailed ? (
          <img
            src={photoUrl}
            alt=""
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          initials
        )}
      </span>
    );
  }

  return (
    <>
      <header className="fm-header">
        <div className="container-fluid fm-header-inner">
          <div className="fm-header-left">
            <button
              type="button"
              className="fm-menu-button d-lg-none"
              onClick={onToggleSidebar}
              aria-label="Open navigation menu"
              title="Open menu"
            >
              <i className="bi bi-list" aria-hidden="true" />
            </button>

            <button
              type="button"
              className="fm-desktop-sidebar-toggle d-none d-lg-inline-flex"
              onClick={onToggleSidebar}
              aria-label="Toggle sidebar"
              title="Show or hide sidebar"
            >
              <i
                className="bi bi-layout-sidebar-inset"
                aria-hidden="true"
              />
            </button>

            <div className="fm-brand">
              <div className="fm-brand-logo">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={logo?.image_name || "FreshMart Logo"}
                    onError={() => setLogo(null)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <i className="bi bi-shop" aria-hidden="true" />
                )}
              </div>

              <div className="fm-header-title">
                <h5>{logo?.image_name || "FreshMart"}</h5>
                <span>Supermarket Management</span>
              </div>
            </div>
          </div>

          <div className="fm-search-wrapper d-none d-md-block">
            <Form
              className="fm-header-search"
              onSubmit={(event) => event.preventDefault()}
            >
              <InputGroup>
                <InputGroup.Text>
                  <i className="bi bi-search" aria-hidden="true" />
                </InputGroup.Text>

                <Form.Control
                  type="search"
                  placeholder="Search products, users..."
                  aria-label="Search"
                  value={searchValue}
                  onChange={(event) =>
                    setSearchValue(event.target.value)
                  }
                />

                {searchValue && (
                  <button
                    type="button"
                    className="fm-search-clear"
                    onClick={() => setSearchValue("")}
                    aria-label="Clear search"
                  >
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </button>
                )}
              </InputGroup>
            </Form>
          </div>

          <div className="fm-header-right">
            <Dropdown
              align="end"
              show={notificationsOpen}
              onToggle={(nextOpen) =>
                setNotificationsOpen(nextOpen)
              }
            >
              <Dropdown.Toggle
                variant="link"
                className="fm-notification-button"
                id="fm-notification-dropdown"
                aria-label={`${unread} unread notifications`}
                title="Notifications"
              >
                <i className="bi bi-bell" aria-hidden="true" />

                {unread > 0 && (
                  <span className="fm-notification-count">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Dropdown.Toggle>

              <Dropdown.Menu className="fm-notification-menu">
                <div className="fm-notification-heading">
                  <strong>Notifications</strong>
                  <span>{unread} unread</span>
                </div>

                <Dropdown.Divider />

                {notifications.length === 0 ? (
                  <div className="fm-notification-empty">
                    <i
                      className="bi bi-bell-slash"
                      aria-hidden="true"
                    />
                    <p>No new notifications</p>
                  </div>
                ) : (
                  <div className="fm-notification-list">
                    {notifications.slice(0, 8).map((item, index) => (
                      <div
                        key={item.id ?? index}
                        className={`fm-notification-item ${
                          !item.read && !item.is_read
                            ? "unread"
                            : ""
                        }`}
                      >
                        <span className="fm-notification-item-icon">
                          <i className="bi bi-bell" />
                        </span>

                        <div>
                          <strong>
                            {item.title || "Notification"}
                          </strong>

                          <p>
                            {item.message || item.description || ""}
                          </p>

                          {item.created_at && (
                            <small>
                              {new Date(
                                item.created_at
                              ).toLocaleString()}
                            </small>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Dropdown.Menu>
            </Dropdown>

            <Dropdown align="end">
              <Dropdown.Toggle
                variant="link"
                className="fm-profile-toggle"
                id="fm-profile-dropdown"
              >
                <Avatar />

                <span className="fm-profile-info d-none d-sm-flex">
                  <strong>{displayName}</strong>
                  <small>{roleLabel}</small>
                </span>
              </Dropdown.Toggle>

              <Dropdown.Menu className="fm-profile-menu">
                <div className="fm-dropdown-user">
                  <Avatar large />

                  <div>
                    <strong>{displayName}</strong>
                    <small>{roleLabel} account</small>
                  </div>
                </div>

                <Dropdown.Divider />

                <Dropdown.Item
                  onClick={() => setShowProfile(true)}
                >
                  <i
                    className="bi bi-person-circle me-2"
                    aria-hidden="true"
                  />
                  My Profile
                </Dropdown.Item>

                <Dropdown.Item
                  onClick={onLogout}
                  className="fm-logout-item"
                >
                  <i
                    className="bi bi-box-arrow-right me-2"
                    aria-hidden="true"
                  />
                  Logout
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
      </header>

      {showProfile && (
        <MyProfile
          user={user}
          onClose={() => setShowProfile(false)}
          onUserUpdated={handleUserUpdated}
        />
      )}
    </>
  );
}

export default Header;
