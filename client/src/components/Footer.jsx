import { Container } from "react-bootstrap";
import "./Footer.css";

function Footer() {
  return (
    <footer className="fm-footer">
      <Container fluid className="px-3 px-md-4">
        <div className="fm-footer-content">
          <div className="fm-footer-brand">
            <span className="fm-footer-mark">F</span>
            <div>
              <strong>FreshMart</strong>
              <p>Smarter supermarket management.</p>
            </div>
          </div>

          <div className="fm-footer-center">
            <span>
              <i className="bi bi-shield-check me-1" />
              Secure system
            </span>
            <span>
              <i className="bi bi-phone me-1" />
              Responsive design
            </span>
          </div>

          <div className="fm-footer-copy">
            <span>
              © {new Date().getFullYear()} FreshMart
            </span>
            <small>All rights reserved.</small>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;