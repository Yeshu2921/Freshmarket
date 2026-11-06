
import { Link } from "react-router-dom";
import "./NotFound.css";

export default function NotFound() {
  return (
    <main className="fm-not-found">
      <div className="fm-not-found-content">
        <div className="fm-not-found-icon">
          <i className="bi bi-compass" />
        </div>

        <p className="fm-not-found-code">ERROR 404</p>

        <h1>Page not found</h1>

        <p className="fm-not-found-description">
          Sorry, the page you are looking for does not exist
          or may have been moved.
        </p>

        <Link to="/login" className="btn btn-success">
          <i className="bi bi-house-door me-2" />
          Return to login
        </Link>
      </div>
    </main>
  );
}
