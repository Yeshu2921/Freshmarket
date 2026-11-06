
import { Col, Container, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import "./HomeFooter.css";

export default function HomeFooter() {
  return (
    <footer id="contact" className="public-footer">
      <Container>
        <Row className="g-4">
          <Col md={5}>
            <Link to="/" className="public-footer-brand">
              <span className="public-brand-icon">F</span>
              <strong>FreshMart</strong>
            </Link>
            <p>
              Your everyday supermarket essentials in one convenient place.
              Discover the products you need with FreshMart.
            </p>
          </Col>

          <Col xs={6} md={3}>
            <h3>Quick Links</h3>
            <Link to="/">Home</Link>
            <Link to="/market">All Products</Link>
            <Link to="/#about">About Us</Link>
          </Col>

          <Col xs={6} md={4}>
            <h3>Account & Contact</h3>
            <Link to="/login">Login</Link>
            <p className="public-footer-contact">
              Ethiopia
              <br />
              Contact the FreshMart team for assistance.
            </p>
          </Col>
        </Row>

        <div className="public-footer-bottom">
          <span>
            © {new Date().getFullYear()} FreshMart. All rights reserved.
          </span>
          <a href="#top">Back to top ↑</a>
        </div>
      </Container>
    </footer>
  );
}
