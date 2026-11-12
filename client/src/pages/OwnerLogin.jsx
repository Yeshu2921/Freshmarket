
import { useState } from "react";
import { Link } from "react-router-dom";
import "./OwnerLogin.css";

const API =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

export default function OwnerLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Invalid email or password."
        );
      }

      // Support common backend response structures.
      const token =
        data.token ||
        data.accessToken ||
        data.access_token;

      const user =
        data.user ||
        data.data?.user ||
        data.data;

      if (!token || !user) {
        console.error("Unexpected login response:", data);
        throw new Error(
          "Login response is missing the user or token."
        );
      }

      if (!["owner", "worker"].includes(user.role)) {
        throw new Error(
          "Only owner and worker accounts can log in here."
        );
      }

      // App.jsx saves the session and navigates to the dashboard.
      if (typeof onLogin !== "function") {
        throw new Error(
          "Login handler is missing. Please check App.jsx."
        );
      }

      onLogin(user, token);
    } catch (err) {
      console.error("Login error:", err);

      setError(
        err.message ||
          "Unable to log in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fm-login-page">
      <div className="fm-login-card">

        {/* BACK TO HOMEPAGE */}
        <div className="fm-login-back-home">
          <Link to="/">
            <i className="bi bi-arrow-left me-2" />
            Back to Homepage
          </Link>
        </div>

        {/* BRAND */}
        <div className="fm-login-brand">
          <div className="fm-login-logo">
            <i className="bi bi-shop" />
          </div>

          <h1>FreshMart</h1>
          <p>Supermarket Management System</p>
        </div>

        {/* LOGIN HEADING */}
        <div className="fm-login-heading">
          <h2>Welcome back</h2>
          <p>Sign in to your account</p>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div
            className="alert alert-danger fm-login-alert"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label
              htmlFor="loginEmail"
              className="form-label"
            >
              Email address
            </label>

            <div className="input-group fm-login-input">
              <span className="input-group-text">
                <i className="bi bi-envelope" />
              </span>

              <input
                id="loginEmail"
                type="email"
                name="email"
                className="form-control"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="mb-2">
            <label
              htmlFor="loginPassword"
              className="form-label"
            >
              Password
            </label>

            <div className="input-group fm-login-input">
              <span className="input-group-text">
                <i className="bi bi-lock" />
              </span>

              <input
                id="loginPassword"
                type={showPassword ? "text" : "password"}
                name="password"
                className="form-control"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="btn btn-outline-secondary fm-password-toggle"
                onClick={() =>
                  setShowPassword((previous) => !previous)
                }
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                <i
                  className={
                    showPassword
                      ? "bi bi-eye-slash"
                      : "bi bi-eye"
                  }
                />
              </button>
            </div>
          </div>

          {/* FORGOT PASSWORD */}
          <div className="fm-login-forgot">
            <Link to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            className="btn btn-primary w-100 fm-login-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <i className="bi bi-arrow-right ms-1" />
              </>
            )}
          </button>
        </form>

        {/* FOOTER */}
        <div className="fm-login-footer">
          <i className="bi bi-shield-lock me-1" />
          Authorized users only
        </div>

      </div>
    </div>
  );
}
