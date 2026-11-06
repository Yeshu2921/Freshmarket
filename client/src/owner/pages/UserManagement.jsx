
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api";
import "./UserManagement.css";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  sex: "",
  role: "worker",
  password: "",
};

const sexLabels = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

function normalizeUser(user) {
  const firstName = user.first_name || "";
  const lastName = user.last_name || "";

  return {
    id: user.id,
    name:
      `${firstName} ${lastName}`.trim() ||
      user.name ||
      user.full_name ||
      "Unnamed User",
    email: user.email || "",
    phone: user.phone || "",
    address: user.address || "",
    sex: user.sex || "",
    role: user.role || "worker",
    status:
      user.is_active === true ||
      user.is_active === 1 ||
      user.is_active === "1"
        ? "Active"
        : "Inactive",
  };
}

function getErrorMessage(error, fallback) {
  return error?.message || fallback;
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionUserId, setActionUserId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Read the currently logged-in user from the existing login session.
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("freshmartUser") || "null");
    } catch {
      return null;
    }
  }, []);

  const currentUserId = currentUser?.id;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest("/users");
      const list = Array.isArray(result) ? result : result?.users;

      if (!Array.isArray(list)) {
        throw new Error("The server returned an unexpected user list.");
      }

      setUsers(list.map(normalizeUser));
    } catch (err) {
      setError(getErrorMessage(err, "Could not load users."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch = [
        user.id,
        user.name,
        user.email,
        user.phone,
        user.address,
      ].some((value) =>
        String(value ?? "").toLowerCase().includes(query)
      );

      const matchesRole =
        roleFilter === "all" || user.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        user.status.toLowerCase() === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const counts = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.status === "Active").length,
      owners: users.filter((user) => user.role === "owner").length,
      workers: users.filter((user) => user.role === "worker").length,
    }),
    [users]
  );

  function clearAlerts() {
    setError("");
    setMessage("");
  }

  function openAddForm() {
    clearAlerts();
    setEditingUserId(null);
    setFormData({ ...emptyForm });
    setShowForm(true);
  }

  function openEditForm(user) {
    clearAlerts();
    setEditingUserId(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      sex: user.sex,
      role: user.role,
      password: "",
    });
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingUserId(null);
    setFormData({ ...emptyForm });
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function getNameParts(fullName) {
    const parts = fullName.trim().split(/\s+/);

    return {
      first_name: parts[0] || "",
      last_name: parts.slice(1).join(" "),
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearAlerts();

    const fullName = formData.name.trim();
    const { first_name, last_name } = getNameParts(fullName);

    if (!first_name || !last_name) {
      setError("Enter both a first name and a last name.");
      return;
    }

    if (formData.phone.trim().length < 9) {
      setError("Please enter a valid phone number.");
      return;
    }

    if (!["owner", "worker"].includes(formData.role)) {
      setError("Select a valid account role.");
      return;
    }

    if (
      editingUserId === null &&
      (formData.password.length < 8 || formData.password.length > 72)
    ) {
      setError("The password must contain 8–72 characters.");
      return;
    }

    const payload = {
      first_name,
      last_name,
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      sex: formData.sex || null,
      role: formData.role,
    };

    if (editingUserId === null) {
      payload.password = formData.password;
    }

    setSaving(true);

    try {
      if (editingUserId !== null) {
        await apiRequest(`/users/${editingUserId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setMessage("User information and role updated successfully.");
      } else {
        await apiRequest("/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setMessage(
          `${formData.role === "owner" ? "Owner" : "Worker"} account created successfully.`
        );
      }

      setShowForm(false);
      setEditingUserId(null);
      setFormData({ ...emptyForm });

      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, "Could not save the user."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user) {
    clearAlerts();

    if (String(user.id) === String(currentUserId)) {
      setError("You cannot deactivate your own logged-in account here.");
      return;
    }

    const nextActive = user.status !== "Active";

    const confirmed = window.confirm(
      `${nextActive ? "Activate" : "Deactivate"} ${user.name}'s account?`
    );

    if (!confirmed) return;

    setActionUserId(user.id);

    try {
      await apiRequest(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextActive }),
      });

      setMessage(
        `${user.name}'s account is now ${nextActive ? "active" : "inactive"}.`
      );

      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, "Could not change account status."));
    } finally {
      setActionUserId(null);
    }
  }

  async function handleDelete(user) {
    clearAlerts();

    if (String(user.id) === String(currentUserId)) {
      setError("You cannot delete your own logged-in account.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.name}'s account? This action may affect their access and related records.`
    );

    if (!confirmed) return;

    setActionUserId(user.id);

    try {
      const result = await apiRequest(`/users/${user.id}`, {
        method: "DELETE",
      });

      setMessage(result?.message || `Account for ${user.name} was deleted.`);
      await loadUsers();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Could not delete this account. Check the owner-protection rules."
        )
      );
    } finally {
      setActionUserId(null);
    }
  }

  async function handleResetPassword(user) {
    clearAlerts();

    if (String(user.id) === String(currentUserId)) {
      setError(
        "Use your own account's password-change feature to change your password."
      );
      return;
    }

    const password = window.prompt(
      `Enter a new password for ${user.name} (8–50 characters):`
    );

    if (password === null) return;

    if (password.length < 8 || password.length > 50) {
      setError("The password must contain 8–50 characters.");
      return;
    }

    if (!window.confirm(`Reset the password for ${user.name}?`)) return;

    setActionUserId(user.id);

    try {
      await apiRequest(`/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });

      setMessage(`Password reset successfully for ${user.name}.`);
    } catch (err) {
      setError(getErrorMessage(err, "Could not reset the password."));
    } finally {
      setActionUserId(null);
    }
  }

  return (
    <main className="user-management">
      <header className="um-heading">
        <div>
          <span className="um-eyebrow">FRESHMART ADMINISTRATION</span>
          <h2>User Management</h2>
          <p>Manage owner and worker accounts, permissions, and contact details.</p>
        </div>

        <div className="um-heading-icon" aria-hidden="true">
          <i className="bi bi-people-fill" />
        </div>
      </header>

      {error && (
        <div className="um-alert um-alert-error" role="alert">
          <i className="bi bi-exclamation-circle-fill" />
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}

      {message && (
        <div className="um-alert um-alert-success" role="status">
          <i className="bi bi-check-circle-fill" />
          <span>{message}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setMessage("")}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}

      <section className="um-stats" aria-label="User statistics">
        <article className="um-stat-card">
          <div className="um-stat-icon blue">
            <i className="bi bi-people-fill" />
          </div>
          <div>
            <span>Total Accounts</span>
            <h3>{counts.total}</h3>
            <small>All registered users</small>
          </div>
        </article>

        <article className="um-stat-card">
          <div className="um-stat-icon green">
            <i className="bi bi-person-check-fill" />
          </div>
          <div>
            <span>Active Accounts</span>
            <h3>{counts.active}</h3>
            <small>Currently enabled</small>
          </div>
        </article>

        <article className="um-stat-card">
          <div className="um-stat-icon purple">
            <i className="bi bi-shield-lock-fill" />
          </div>
          <div>
            <span>Owners</span>
            <h3>{counts.owners}</h3>
            <small>Administrative accounts</small>
          </div>
        </article>

        <article className="um-stat-card">
          <div className="um-stat-icon orange">
            <i className="bi bi-person-badge-fill" />
          </div>
          <div>
            <span>Workers</span>
            <h3>{counts.workers}</h3>
            <small>Staff accounts</small>
          </div>
        </article>
      </section>

      <section className="um-table-card">
        <div className="um-table-title">
          <div>
            <h3>Accounts Directory</h3>
            <p>
              Showing <strong>{filteredUsers.length}</strong> of {counts.total}{" "}
              accounts
            </p>
          </div>

          <button
            type="button"
            className="um-refresh-btn"
            onClick={loadUsers}
            disabled={loading}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? "um-spinning" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="um-filters">
          <div className="um-search">
            <i className="bi bi-search" />
            <input
              type="search"
              aria-label="Search accounts"
              placeholder="Search name, ID, email, or phone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">All roles</option>
            <option value="owner">Owners</option>
            <option value="worker">Workers</option>
          </select>

          <select
            aria-label="Filter by account status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="um-add-user-row">
          <div className="um-add-user-copy">
            <span className="um-add-user-icon">
              <i className="bi bi-person-plus-fill" />
            </span>
            <div>
              <strong>Create an account</strong>
              <span>Add an owner or worker and assign their initial role.</span>
            </div>
          </div>

          <button
            type="button"
            className="um-add-user-btn"
            onClick={openAddForm}
          >
            <i className="bi bi-plus-lg" />
            Add Account
          </button>
        </div>

        {showForm && (
          <form className="um-user-form" onSubmit={handleSubmit}>
            <div className="um-form-heading">
              <div>
                <span className="um-form-kicker">
                  {editingUserId !== null ? "ACCOUNT SETTINGS" : "NEW ACCOUNT"}
                </span>
                <h3>
                  {editingUserId !== null ? "Edit User Account" : "Create User Account"}
                </h3>
                <p>
                  {editingUserId !== null
                    ? "Update details or change this user's role."
                    : "Complete the details and choose the account role."}
                </p>
              </div>

              <button
                type="button"
                className="um-close-form"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close form"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="um-form-grid">
              <label>
                Full name <span>*</span>
                <input
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="First and last name"
                  autoComplete="name"
                  maxLength={150}
                  required
                />
              </label>

              <label>
                Email address <span>*</span>
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  placeholder="name@example.com"
                  autoComplete="email"
                  maxLength={190}
                  required
                />
              </label>

              <label>
                Phone number <span>*</span>
                <input
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleFormChange}
                  placeholder="Enter phone number"
                  autoComplete="tel"
                  maxLength={30}
                  required
                />
              </label>

              <label>
                Address
                <input
                  name="address"
                  value={formData.address}
                  onChange={handleFormChange}
                  placeholder="Enter address"
                  autoComplete="street-address"
                  maxLength={255}
                />
              </label>

              <label>
                Sex
                <select
                  name="sex"
                  value={formData.sex}
                  onChange={handleFormChange}
                >
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>

              <label>
                Account role <span>*</span>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleFormChange}
                  required
                >
                  <option value="worker">Worker</option>
                  <option value="owner">Owner</option>
                </select>
              </label>

              {editingUserId === null && (
                <label className="um-password-field">
                  Initial password <span>*</span>
                  <input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                  />
                </label>
              )}
            </div>

            {editingUserId !== null && (
              <div className="um-role-warning">
                <i className="bi bi-shield-exclamation" />
                Changing a role changes the user's permissions. The backend must
                protect the last active owner.
              </div>
            )}

            {editingUserId === null && (
              <div className="um-password-note">
                <i className="bi bi-shield-lock-fill" />
                <span>
                  Passwords must be hashed by the backend before they are stored.
                  Share initial passwords securely.
                </span>
              </div>
            )}

            <div className="um-form-actions">
              <button
                type="button"
                className="um-cancel-btn"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>

              <button type="submit" className="um-save-btn" disabled={saving}>
                {saving ? (
                  <>
                    <span className="um-spinner" />
                    Saving...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle" />
                    {editingUserId !== null ? "Save Changes" : "Create Account"}
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <div className="table-responsive um-table-wrap">
          <table className="table um-table align-middle">
            <thead>
              <tr>
                <th>User</th>
                <th>ID</th>
                <th>Sex</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Account</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="um-table-message">
                    <span className="um-spinner um-spinner-dark" />
                    Loading accounts...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="um-table-message">
                    <i className="bi bi-search um-empty-icon" />
                    <strong>No accounts found</strong>
                    <span>Try another search term or change your filters.</span>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSelf =
                    String(user.id) === String(currentUserId);
                  const busy = actionUserId === user.id;

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="um-user-cell">
                          <div
                            className={`um-avatar ${user.role === "owner" ? "owner-avatar" : ""}`}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="um-user-details">
                            <strong>{user.name}</strong>
                            <span>{user.email}</span>
                            {isSelf && <small className="um-you-label">Your account</small>}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="um-id">#{user.id}</span>
                      </td>

                      <td>
                        {sexLabels[user.sex] || "—"}
                      </td>

                      <td>{user.phone || "—"}</td>

                      <td>
                        <span className={`um-role-badge role-${user.role}`}>
                          <i
                            className={`bi ${
                              user.role === "owner"
                                ? "bi-shield-lock-fill"
                                : "bi-person-fill"
                            }`}
                          />
                          {user.role === "owner" ? "Owner" : "Worker"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`um-status ${
                            user.status === "Active" ? "is-active" : "is-inactive"
                          }`}
                        >
                          <span className="um-status-dot" />
                          {user.status}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`um-status-btn ${
                            user.status === "Active" ? "deactivate" : "activate"
                          }`}
                          disabled={isSelf || busy}
                          onClick={() => toggleStatus(user)}
                          title={isSelf ? "Cannot deactivate your own account here" : ""}
                        >
                          {busy
                            ? "Please wait..."
                            : user.status === "Active"
                              ? "Deactivate"
                              : "Activate"}
                        </button>
                      </td>

                      <td>
                        <div className="um-action-buttons">
                          <button
                            type="button"
                            className="um-icon-btn edit"
                            title="Edit details or change role"
                            aria-label={`Edit ${user.name}`}
                            disabled={busy}
                            onClick={() => openEditForm(user)}
                          >
                            <i className="bi bi-pencil-square" />
                          </button>

                          <button
                            type="button"
                            className="um-icon-btn reset"
                            title="Reset password"
                            aria-label={`Reset password for ${user.name}`}
                            disabled={isSelf || busy}
                            onClick={() => handleResetPassword(user)}
                          >
                            <i className="bi bi-key-fill" />
                          </button>

                          <button
                            type="button"
                            className="um-icon-btn delete"
                            title="Delete account"
                            aria-label={`Delete ${user.name}`}
                            disabled={isSelf || busy}
                            onClick={() => handleDelete(user)}
                          >
                            <i className="bi bi-trash3-fill" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className="um-table-footer">
          <span>
            <i className="bi bi-shield-check" />
            Owner and worker roles are controlled by the secure backend.
          </span>
          <span>{filteredUsers.length} displayed</span>
        </footer>
      </section>
    </main>
  );
}

export default UserManagement;
