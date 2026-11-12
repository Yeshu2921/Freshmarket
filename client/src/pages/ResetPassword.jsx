
import { useState } from "react";
import { Alert, Button, Card, Container, Form, Spinner } from "react-bootstrap";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import "./ResetPassword.css";

const API =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("The reset link is missing its token. Request a new link.");
      return;
    }

    if (password.length < 8 || password.length > 50) {
      setError("Your new password must contain 8–50 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: password,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to reset your password.");
      }

      setSuccess("Your password has been reset successfully.");

      // Return to login after a short pause.
      window.setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the server. Please try again."
          : err.message || "Password reset failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="fm-new-password-page">
      <Container className="fm-new-password-container">
        <Card className="fm-new-password-card border-0">
          <Link to="/login" className="fm-new-password-logo">
            <span className="fm-new-password-logo-mark">F</span>
            FreshMart
          </Link>

          <div className="fm-new-password-icon">
            <i className="bi bi-shield-lock" />
          </div>

          <span className="fm-new-password-eyebrow">ACCOUNT SECURITY</span>
          <h1>Create a new password</h1>
          <p className="fm-new-password-description">
            Choose a strong password you have not used for this account before.
          </p>

          {!token && (
            <Alert variant="warning">
              This reset link has no token. Request a new password-reset link.
            </Alert>
          )}

          {error && (
            <Alert variant="danger" role="alert">
              <i className="bi bi-exclamation-circle me-2" />
              {error}
            </Alert>
          )}

          {success && (
            <Alert variant="success" role="status">
              <i className="bi bi-check-circle me-2" />
              {success}
            </Alert>
          )}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="fm-new-password-field mb-3">
              <Form.Label>New password</Form.Label>
              <div className="fm-new-password-input">
                <i className="bi bi-lock" />
                <Form.Control
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={50}
                  autoComplete="new-password"
                  required
                  disabled={loading || !token || Boolean(success)}
                />
                <button
                  type="button"
                  className="fm-new-password-eye"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
                </button>
              </div>
              <Form.Text>Use 8–50 characters and follow your system's password rules.</Form.Text>
            </Form.Group>

            <Form.Group className="fm-new-password-field mb-4">
              <Form.Label>Confirm new password</Form.Label>
              <div className="fm-new-password-input">
                <i className="bi bi-lock-fill" />
                <Form.Control
                  type={showConfirm ? "text" : "password"}
                  placeholder="Enter the password again"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  maxLength={50}
                  autoComplete="new-password"
                  required
                  disabled={loading || !token || Boolean(success)}
                />
                <button
                  type="button"
                  className="fm-new-password-eye"
                  onClick={() => setShowConfirm((value) => !value)}
                  aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
                >
                  <i className={`bi ${showConfirm ? "bi-eye-slash" : "bi-eye"}`} />
                </button>
              </div>
            </Form.Group>

            <Button
              type="submit"
              className="fm-new-password-submit w-100"
              disabled={loading || !token || Boolean(success)}
            >
              {loading ? (
                <>
                  <Spinner size="sm" animation="border" className="me-2" />
                  Updating password...
                </>
              ) : (
                <>
                  Reset password
                  <i className="bi bi-arrow-right ms-2" />
                </>
              )}
            </Button>
          </Form>

          <Link to="/login" className="fm-new-password-back">
            <i className="bi bi-arrow-left me-2" />
            Back to sign in
          </Link>

          <div className="fm-new-password-footer">
            <i className="bi bi-shield-check me-1" />
            Secure password recovery
            <div>© {new Date().getFullYear()} FreshMart</div>
          </div>
        </Card>
      </Container>
    </main>
  );
}
