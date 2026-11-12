
import { useState } from "react";
import { Link } from "react-router-dom";
import "./ForgotPassword.css";

const API =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to process your request right now."
        );
      }

      setMessage(
        data.message ||
          "If this email belongs to an eligible account, a reset link will be sent."
      );
    } catch (err) {
      setError(
        err.message || "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fm-forgot-page">
      <div className="fm-forgot-card">
        <Link to="/login" className="fm-forgot-back">
          <i className="bi bi-arrow-left me-1" />
          Back to login
        </Link>

        <div className="fm-forgot-icon">
          <i className="bi bi-envelope-lock" />
        </div>

        <h1>Forgot password?</h1>
        <p className="fm-forgot-description">
          Enter your registered email to receive a reset link.
        </p>

        {message && (
          <div className="alert alert-success fm-forgot-alert" role="status">
            {message}
          </div>
        )}

        {error && (
          <div className="alert alert-danger fm-forgot-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="forgotEmail" className="form-label">
              Email address
            </label>

            <div className="input-group fm-forgot-input">
              <span className="input-group-text">
                <i className="bi bi-envelope" />
              </span>

              <input
                id="forgotEmail"
                type="email"
                className="form-control"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-100 fm-forgot-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>

        <div className="fm-forgot-footer">
          <i className="bi bi-shield-check me-1" />
          Secure password recovery
        </div>
      </div>
    </div>
  );
}
