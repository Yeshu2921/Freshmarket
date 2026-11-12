
import { useEffect, useState } from "react";
import {
  Button,
  Col,
  Container,
  Row,
} from "react-bootstrap";
import { Link } from "react-router-dom";
import "./HomePage.css";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const IMAGE_BASE =
  API_BASE.replace(/\/api\/?$/, "");

// Convert the image path saved in the database into a browser URL.
const getImageUrl = (imagePath) => {
  if (!imagePath) return "";

  if (
    imagePath.startsWith("http://") ||
    imagePath.startsWith("https://")
  ) {
    return imagePath;
  }

  return `${IMAGE_BASE}/${imagePath.replace(/^\/+/, "")}`;
};

export default function HomePage() {
  const [banner, setBanner] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomepageImages = async () => {
      try {
        setLoading(true);

        const [bannerResponse, postsResponse] = await Promise.all([
          fetch(`${API_BASE}/homepage/banner`),
          fetch(`${API_BASE}/homepage/posts`),
        ]);

        if (!bannerResponse.ok || !postsResponse.ok) {
          throw new Error("Failed to load homepage images.");
        }

        const bannerData = await bannerResponse.json();
        const postsData = await postsResponse.json();

        setBanner(bannerData.banner || null);
        setGalleryImages(
          Array.isArray(postsData.posts) ? postsData.posts : []
        );
      } catch (error) {
        console.error("Homepage image loading error:", error);
        setBanner(null);
        setGalleryImages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHomepageImages();
  }, []);

  return (
    <div className="home-page">

      {/* Banner */}
      <section className="home-banner-section">
        <div className="home-banner">

          {banner?.image_path && (
            <img
              src={getImageUrl(banner.image_path)}
              alt="FreshMart supermarket"
              className="home-banner-image"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          )}

          <div className="home-banner-overlay" />

          <div className="home-banner-content">
            <Button
              as={Link}
              to="/market"
              className="home-market-button"
            >
              Go to Market <span aria-hidden="true">→</span>
            </Button>
          </div>

        </div>
      </section>

      {/* Gallery */}
      <section className="home-gallery">
        <Container>

          <div className="home-gallery-heading">
            <h2>Explore Our Everyday Essentials</h2>
            <p>
              Discover fresh produce, pantry favourites, drinks and
              everyday essentials.
            </p>
          </div>

          {loading ? (
            <div className="home-loading">
              Loading homepage images...
            </div>
          ) : (
            <>
              <Row className="home-gallery-grid g-3">
                {galleryImages.map((item) => (
                  <Col
                    xs={6}
                    sm={4}
                    md={3}
                    lg={2}
                    key={item.id}
                  >
                    <Link
                      to="/market"
                      className="home-gallery-card"
                      aria-label={`Browse ${item.image_name}`}
                    >
                      <div className="home-gallery-image-wrap">
                        <img
                          src={getImageUrl(item.image_path)}
                          alt={item.image_name}
                          className="home-gallery-image"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src =
                              "https://placehold.co/500x350/e8efe9/245638?text=FreshMart";
                          }}
                        />
                      </div>

                      <div className="home-gallery-card-info">
                        <h3>{item.image_name}</h3>
                      </div>
                    </Link>
                  </Col>
                ))}
              </Row>

              {galleryImages.length === 0 && (
                <div className="home-loading">
                  No homepage images available yet.
                </div>
              )}
            </>
          )}

          <div className="home-gallery-cta">
            <Button
              as={Link}
              to="/market"
              className="home-market-button"
            >
              Explore All Products{" "}
              <span aria-hidden="true">→</span>
            </Button>
          </div>

        </Container>
      </section>

      {/* About */}
      <section id="about" className="home-about">
        <Container>
          <h2>Welcome to FreshMart</h2>
          <p>
            Browse our catalogue to discover products available through
            FreshMart and find everyday essentials in one place.
          </p>
        </Container>
      </section>

    </div>
  );
}
