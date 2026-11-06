
import { useEffect, useState } from "react";
import {
  Button,
  Container,
  Nav,
  Navbar,
} from "react-bootstrap";
import {
  Link,
  useLocation,
} from "react-router-dom";

import "./HomeHeader.css";

export default function HomeHeader() {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();

  // Close the mobile menu after navigating to another page.
  useEffect(() => {
    setExpanded(false);
  }, [location.pathname, location.search, location.hash]);

  function closeMenu() {
    setExpanded(false);
  }

  return (
    <header className="public-header">
      
      

      {/* Main responsive navigation */}
      <Navbar
        expand="lg"
        expanded={expanded}
        onToggle={(nextExpanded) => setExpanded(nextExpanded)}
        className="public-main-nav"
      >
        <Container>
          {/* Brand */}
          <Navbar.Brand
            as={Link}
            to="/"
            className="public-brand"
            onClick={closeMenu}
          >
            <span className="public-brand-icon">F</span>

            <span className="public-brand-text">
              <strong>FreshMart</strong>
              <small>SUPERMARKET</small>
            </span>
          </Navbar.Brand>

          {/* Mobile menu button */}
          <Navbar.Toggle
            aria-controls="public-navigation"
            aria-label="Toggle navigation"
          />

          <Navbar.Collapse id="public-navigation">
            <Nav
              className="ms-auto align-items-lg-center public-nav-links"
              onSelect={closeMenu}
            >
              <Nav.Link as={Link} to="/">
                Home
              </Nav.Link>

              <Nav.Link as={Link} to="/market">
                All Products
              </Nav.Link>
              <Nav.Link as={Link} to="/your-orders">
              Your Orders
               </Nav.Link>
              <Nav.Link as={Link} to="/#about">
                About Us
              </Nav.Link>

              <Nav.Link as={Link} to="/#contact">
                Contact
              </Nav.Link>

              <Button
                as={Link}
                to="/login"
                className="public-login"
                onClick={closeMenu}
              >
                Login
              </Button>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </header>
  );
}
