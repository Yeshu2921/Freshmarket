
import { useEffect, useState } from "react";
import "./MyProfile.css";

const API = "http://localhost:5134/api";

function MyProfile({ user = {}, onClose, onUserUpdated }) {
  const [form, setForm] = useState({
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    email: user.email || "",
    phone: user.phone || "",
    address: user.address || "",
    sex: user.sex || "",
  });

  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(user.profile_image || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    return () => {
      if (preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  function updateField(event) {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  function togglePassword(field) {
    setShowPasswords((previous) => ({
      ...previous,
      [field]: !previous[field],
    }));
  }

  async function request(endpoint, options = {}) {
    const token = sessionStorage.getItem("freshmartToken");

    const response = await fetch(`${API}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      throw new Error(result.message || "The request failed.");
    }

    return result;
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const result = await request("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(form),
      });

      const updatedUser = result.user || form;
      onUserUpdated?.(updatedUser);

      setMessage("Profile information updated successfully.");
    } catch (err) {
      setError(err.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(event) {
    event.preventDefault();

    if (!photo) {
      setError("Please choose a profile photo first.");
      return;
    }

    if (!photo.type.startsWith("image/")) {
      setError("Choose a valid image file.");
      return;
    }

    if (photo.size > 5 * 1024 * 1024) {
      setError("The photo must be 5 MB or smaller.");
      return;
    }

    setError("");
    setMessage("");
    setUploading(true);

    try {
      const data = new FormData();
      data.append("profile_image", photo);

      const result = await request("/auth/profile-photo", {
        method: "POST",
        body: data,
      });

      if (!result.user?.profile_image) {
        throw new Error(
          "The server did not return the saved profile image path."
        );
      }

      onUserUpdated?.(result.user);
      setPreview(result.user.profile_image);
      setPhoto(null);

      setMessage("Profile photo updated successfully.");
    } catch (err) {
      setError(err.message || "Could not upload the profile photo.");
    } finally {
      setUploading(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 8 || newPassword.length > 50) {
      setError("Your new password must contain 8–50 characters.");
      return;
    }

    if (
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/\d/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setError(
        "Use uppercase and lowercase letters, a number, and a symbol."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setChangingPassword(true);

    try {
  await request("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword,
      newPassword,
      confirmPassword,
    }),
  });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setShowPasswords({
        current: false,
        new: false,
        confirm: false,
      });

      setMessage("Password changed successfully.");
    } catch (err) {
      setError(err.message || "Could not change your password.");
    } finally {
      setChangingPassword(false);
    }
  }

  const photoUrl = preview
    ? /^(https?:\/\/|data:|blob:)/i.test(preview)
      ? preview
      : `http://localhost:5134/${preview.replace(/^\/+/, "")}`
    : "";

  return (
    <div
      className="mp-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="mp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mp-title"
      >
        <header className="mp-header">
          <div>
            <span>FRESHMART ACCOUNT</span>
            <h2 id="mp-title">My Profile</h2>
            <p>Manage your personal information and security.</p>
          </div>

          <button
            type="button"
            className="mp-close"
            onClick={onClose}
            aria-label="Close profile"
          >
            <i className="bi bi-x-lg" />
          </button>
        </header>

        {error && <div className="mp-alert error">{error}</div>}
        {message && <div className="mp-alert success">{message}</div>}

        <div className="mp-body">
          {/* Profile photo */}
          <section className="mp-photo-section">
            <div className="mp-photo">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Your profile"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <i className="bi bi-person-fill" />
              )}
            </div>

            <div className="mp-photo-info">
              <strong>Profile picture</strong>
              <p>JPG, PNG, or another supported image. Maximum 5 MB.</p>

              <form onSubmit={uploadPhoto} className="mp-photo-form">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) return;

                    setPhoto(selected);
                    setPreview(URL.createObjectURL(selected));
                    setError("");
                    setMessage("");
                  }}
                />

                <button type="submit" disabled={!photo || uploading}>
                  {uploading ? "Uploading..." : "Upload Photo"}
                </button>
              </form>
            </div>
          </section>

          {/* Personal information */}
          <form className="mp-form" onSubmit={saveProfile}>
            <h3>Personal information</h3>

            <div className="mp-grid">
              <label>
                First name
                <input
                  name="first_name"
                  value={form.first_name}
                  onChange={updateField}
                  required
                  maxLength={100}
                />
              </label>

              <label>
                Last name
                <input
                  name="last_name"
                  value={form.last_name}
                  onChange={updateField}
                  required
                  maxLength={100}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                  required
                  maxLength={190}
                />
              </label>

              <label>
                Phone
                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  maxLength={30}
                />
              </label>

              <label>
                Address
                <input
                  name="address"
                  value={form.address}
                  onChange={updateField}
                  maxLength={255}
                />
              </label>

              <label>
                Sex
                <select
                  name="sex"
                  value={form.sex}
                  onChange={updateField}
                >
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">
                    Prefer not to say
                  </option>
                </select>
              </label>
            </div>

            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </form>

          {/* Change password */}
          <form
            className="mp-form mp-password-form"
            onSubmit={changePassword}
          >
            <h3>Change password</h3>
            <p>Use your current password to verify your identity.</p>

            {/* Current password */}
            <label>
              Current password

              <div className="mp-password-input">
                <input
                  type={showPasswords.current ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) =>
                    setCurrentPassword(event.target.value)
                  }
                  required
                />

                <button
                  type="button"
                  className="mp-password-toggle"
                  onClick={() => togglePassword("current")}
                  aria-label={
                    showPasswords.current
                      ? "Hide current password"
                      : "Show current password"
                  }
                  aria-pressed={showPasswords.current}
                  title={
                    showPasswords.current
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  <i
                    className={
                      showPasswords.current
                        ? "bi bi-eye-slash"
                        : "bi bi-eye"
                    }
                  />
                </button>
              </div>
            </label>

            {/* New password */}
            <label>
              New password

              <div className="mp-password-input">
                <input
                  type={showPasswords.new ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(event.target.value)
                  }
                  minLength={8}
                  maxLength={50}
                  required
                />

                <button
                  type="button"
                  className="mp-password-toggle"
                  onClick={() => togglePassword("new")}
                  aria-label={
                    showPasswords.new
                      ? "Hide new password"
                      : "Show new password"
                  }
                  aria-pressed={showPasswords.new}
                  title={
                    showPasswords.new
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  <i
                    className={
                      showPasswords.new
                        ? "bi bi-eye-slash"
                        : "bi bi-eye"
                    }
                  />
                </button>
              </div>
            </label>

            {/* Confirm new password */}
            <label>
              Confirm new password

              <div className="mp-password-input">
                <input
                  type={showPasswords.confirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  minLength={8}
                  maxLength={50}
                  required
                />

                <button
                  type="button"
                  className="mp-password-toggle"
                  onClick={() => togglePassword("confirm")}
                  aria-label={
                    showPasswords.confirm
                      ? "Hide confirmation password"
                      : "Show confirmation password"
                  }
                  aria-pressed={showPasswords.confirm}
                  title={
                    showPasswords.confirm
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  <i
                    className={
                      showPasswords.confirm
                        ? "bi bi-eye-slash"
                        : "bi bi-eye"
                    }
                  />
                </button>
              </div>
            </label>

            <button type="submit" disabled={changingPassword}>
              {changingPassword
                ? "Changing..."
                : "Change Password"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

export default MyProfile;
