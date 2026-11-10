
import { useEffect, useMemo, useState } from "react";
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

const API_ORIGIN = "http://localhost:5134";
const API_BASE = `${API_ORIGIN}/api`;

function getImageUrl(path) {
  if (!path) return "";

  if (/^(https?:\/\/|data:|blob:)/i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}/${String(path).replace(/^\/+/, "")}`;
}

export default function HomeHeader() {
  const [expanded, setExpanded] = useState(false);

  // Homepage logo
  const [logo, setLogo] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const location = useLocation();

  // Close the mobile menu after navigating to another page.
  useEffect(() => {
    setExpanded(false);
  }, [location.pathname, location.search, location.hash]);

  // Load the logo uploaded from Owner Settings.
  useEffect(() => {
    const controller = new AbortController();

    async function fetchLogo() {
      try {
        const response = await fetch(`${API_BASE}/homepage/logo`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load homepage logo.");
        }

        const data = await response.json();

        setLogo(data.logo || null);
        setLogoFailed(false);
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

  const logoUrl = useMemo(
    () => getImageUrl(logo?.image_path),
    [logo?.image_path]
  );

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
            <span className="public-brand-icon">
              {logoUrl && !logoFailed ? (
                <img
                  src={logoUrl}
                  alt={logo?.image_name || "FreshMart Logo"}
                  onError={() => setLogoFailed(true)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                "F"
              )}
            </span>

            <span className="public-brand-text">
              <strong>{logo?.image_name || "FreshMart"}</strong>
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
