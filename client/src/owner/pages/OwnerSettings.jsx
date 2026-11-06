
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Modal,
  Row,
  Spinner,
} from "react-bootstrap";

import "./OwnerSettings.css";

const API_BASE = "http://localhost:5134/api";
const IMAGE_BASE = "http://localhost:5134";

const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function OwnerSettings() {
  const token = sessionStorage.getItem("freshmartToken");

  const bannerInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Homepage content.
  const [banner, setBanner] = useState(null);
  const [posts, setPosts] = useState([]);

  // Loading states.
  const [loading, setLoading] = useState(true);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [postUploading, setPostUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // New gallery image form.
  const [showPostForm, setShowPostForm] = useState(false);
  const [imageName, setImageName] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState("");

  // Notifications.
  const [message, setMessage] = useState({
    type: "",
    text: "",
  });

  // --------------------------------------------------
  // IMAGE URL
  // --------------------------------------------------

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

  // --------------------------------------------------
  // IMAGE VALIDATION
  // --------------------------------------------------

  const validateImage = (file) => {
    if (!file) {
      return "Please select an image.";
    }

    const extension = file.name
      .substring(file.name.lastIndexOf("."))
      .toLowerCase();

    const validExtension =
      ALLOWED_IMAGE_EXTENSIONS.includes(extension);

    const validMimeType =
      file.type.startsWith("image/") || file.type === "";

    if (!validExtension || !validMimeType) {
      return "Unsupported image format. Please select JPG, JPEG, JFIF, PNG, WEBP, GIF, BMP or AVIF.";
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return "Image size must not exceed 5 MB.";
    }

    return "";
  };

  // --------------------------------------------------
  // LOAD HOMEPAGE CONTENT
  // --------------------------------------------------

  const fetchHomepageContent = useCallback(async () => {
    setLoading(true);

    try {
      const [bannerResponse, postsResponse] = await Promise.all([
        fetch(`${API_BASE}/homepage/banner`),
        fetch(`${API_BASE}/homepage/posts`),
      ]);

      const bannerData = await bannerResponse.json();
      const postsData = await postsResponse.json();

      if (!bannerResponse.ok) {
        throw new Error(
          bannerData.message || "Unable to load homepage banner."
        );
      }

      if (!postsResponse.ok) {
        throw new Error(
          postsData.message || "Unable to load homepage images."
        );
      }

      setBanner(bannerData.banner || null);
      setPosts(postsData.posts || []);
    } catch (error) {
      setMessage({
        type: "danger",
        text: error.message || "Unable to load homepage content.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHomepageContent();
  }, [fetchHomepageContent]);

  // --------------------------------------------------
  // CLEAN UP IMAGE PREVIEW
  // --------------------------------------------------

  useEffect(() => {
    if (!selectedImage) {
      setPreviewImage("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(selectedImage);

    setPreviewImage(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [selectedImage]);

  // --------------------------------------------------
  // CHANGE HOMEPAGE BANNER
  // --------------------------------------------------

  const handleBannerChange = async (event) => {
    const file = event.target.files?.[0];

    // Allow selecting the same image again.
    event.target.value = "";

    if (!file) return;

    const validationError = validateImage(file);

    if (validationError) {
      setMessage({
        type: "danger",
        text: validationError,
      });
      return;
    }

    if (!token) {
      setMessage({
        type: "danger",
        text: "Your login session has expired. Please log in again.",
      });
      return;
    }

    try {
      setBannerUploading(true);
      setMessage({ type: "", text: "" });

      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`${API_BASE}/homepage/banner`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update banner.");
      }

      // Immediately update the banner without reloading Settings.
      if (data.banner) {
        setBanner(data.banner);
      }

      setMessage({
        type: "success",
        text: data.message || "Homepage banner updated successfully.",
      });
    } catch (error) {
      setMessage({
        type: "danger",
        text: error.message || "Unable to update banner.",
      });
    } finally {
      setBannerUploading(false);
    }
  };

  // --------------------------------------------------
  // SELECT GALLERY IMAGE
  // --------------------------------------------------

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedImage(null);
      return;
    }

    const validationError = validateImage(file);

    if (validationError) {
      setMessage({
        type: "danger",
        text: validationError,
      });

      event.target.value = "";
      setSelectedImage(null);
      return;
    }

    setMessage({ type: "", text: "" });
    setSelectedImage(file);
  };

  // --------------------------------------------------
  // POST NEW GALLERY IMAGE
  // --------------------------------------------------

  const handleCreatePost = async (event) => {
    event.preventDefault();

    if (!imageName.trim()) {
      setMessage({
        type: "danger",
        text: "Please enter an image name.",
      });
      return;
    }

    if (imageName.trim().toLowerCase() === "bannerimage") {
      setMessage({
        type: "danger",
        text: "This name is reserved for the homepage banner.",
      });
      return;
    }

    if (!selectedImage) {
      setMessage({
        type: "danger",
        text: "Please select an image.",
      });
      return;
    }

    const validationError = validateImage(selectedImage);

    if (validationError) {
      setMessage({
        type: "danger",
        text: validationError,
      });
      return;
    }

    if (!token) {
      setMessage({
        type: "danger",
        text: "Your login session has expired. Please log in again.",
      });
      return;
    }

    try {
      setPostUploading(true);
      setMessage({ type: "", text: "" });

      const formData = new FormData();

      formData.append("image_name", imageName.trim());
      formData.append("image", selectedImage);

      const response = await fetch(`${API_BASE}/homepage/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to upload image.");
      }

      // Add the new image immediately.
      // Do not reload the whole Settings page.
      if (data.post) {
        setPosts((previousPosts) => [
          data.post,
          ...previousPosts.filter(
            (post) => post.id !== data.post.id
          ),
        ]);
      } else {
        // Fallback if the backend does not return the created post.
        const postsResponse = await fetch(`${API_BASE}/homepage/posts`);
        const postsData = await postsResponse.json();

        if (!postsResponse.ok) {
          throw new Error(
            postsData.message || "Image uploaded, but gallery could not refresh."
          );
        }

        setPosts(postsData.posts || []);
      }

      // Reset form.
      setImageName("");
      setSelectedImage(null);
      setShowPostForm(false);

      if (galleryInputRef.current) {
        galleryInputRef.current.value = "";
      }

      setMessage({
        type: "success",
        text: data.message || "Homepage image uploaded successfully.",
      });

    } catch (error) {
      setMessage({
        type: "danger",
        text: error.message || "Unable to upload homepage image.",
      });
    } finally {
      setPostUploading(false);
    }
  };

  // --------------------------------------------------
  // DELETE GALLERY IMAGE
  // --------------------------------------------------

  const handleDeletePost = async (post) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${post.image_name}"?`
    );

    if (!confirmed) return;

    if (!token) {
      setMessage({
        type: "danger",
        text: "Your login session has expired. Please log in again.",
      });
      return;
    }

    try {
      setDeletingId(post.id);
      setMessage({ type: "", text: "" });

      const response = await fetch(
        `${API_BASE}/homepage/posts/${post.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete image.");
      }

      // Remove image immediately from the gallery.
      setPosts((previousPosts) =>
        previousPosts.filter((item) => item.id !== post.id)
      );

      setMessage({
        type: "success",
        text: data.message || "Homepage image deleted successfully.",
      });
    } catch (error) {
      setMessage({
        type: "danger",
        text: error.message || "Unable to delete image.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  // --------------------------------------------------
  // CLOSE POST FORM
  // --------------------------------------------------

  const handleClosePostForm = () => {
    if (postUploading) return;

    setShowPostForm(false);
    setImageName("");
    setSelectedImage(null);

    if (galleryInputRef.current) {
      galleryInputRef.current.value = "";
    }
  };

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <Container fluid className="owner-settings-page">

      {/* PAGE HEADER */}
      <div className="owner-settings-header">
        <div>
          <span className="settings-eyebrow">
            OWNER CONTROL PANEL
          </span>

          <h2>
            <i className="bi bi-gear-wide-connected"></i>
            Settings
          </h2>

          <p>
            Manage your FreshMart homepage banner and gallery images.
          </p>
        </div>

        <Button
          type="button"
          className="settings-refresh-btn"
          onClick={fetchHomepageContent}
          disabled={loading}
        >
          <i className="bi bi-arrow-clockwise me-2"></i>
          Refresh
        </Button>
      </div>

      {/* ALERT MESSAGE */}
      {message.text && (
        <Alert
          variant={message.type}
          dismissible
          onClose={() => setMessage({ type: "", text: "" })}
          className="settings-alert"
        >
          {message.text}
        </Alert>
      )}

      {loading ? (
        <div className="settings-loading">
          <Spinner animation="border" variant="success" />
          <p>Loading homepage settings...</p>
        </div>
      ) : (
        <>
          {/* HOMEPAGE BANNER */}
          <Card className="settings-section-card banner-section">
            <Card.Body>
              <div className="settings-section-heading">
                <div>
                  <div className="settings-icon banner-icon">
                    <i className="bi bi-image"></i>
                  </div>

                  <div>
                    <h5>Homepage Banner</h5>
                    <p>
                      This is the main banner displayed on your customer
                      homepage.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  className="settings-primary-btn"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={bannerUploading}
                >
                  {bannerUploading ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-cloud-arrow-up me-2"></i>
                      Change Banner
                    </>
                  )}
                </Button>

                <Form.Control
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*,.jfif"
                  className="d-none"
                  onChange={handleBannerChange}
                />
              </div>

              <div className="settings-banner-preview">
                {banner?.image_path ? (
                  <img
                    src={getImageUrl(banner.image_path)}
                    alt="Current homepage banner"
                  />
                ) : (
                  <div className="settings-empty-banner">
                    <i className="bi bi-image"></i>
                    <h6>No homepage banner uploaded</h6>
                    <p>
                      Choose an image to display on your homepage.
                    </p>
                  </div>
                )}

                {banner?.image_path && (
                  <div className="banner-current-label">
                    <i className="bi bi-check-circle-fill me-2"></i>
                    Current Banner
                  </div>
                )}
              </div>

              <div className="settings-image-note">
                <i className="bi bi-info-circle me-2"></i>
                Supported image formats depend on backend validation.
                Maximum file size: 5 MB.
              </div>
            </Card.Body>
          </Card>

          {/* GALLERY SECTION */}
          <Card className="settings-section-card gallery-section">
            <Card.Body>
              <div className="gallery-heading">
                <div className="settings-section-heading">
                  <div className="settings-icon gallery-icon">
                    <i className="bi bi-grid"></i>
                  </div>

                  <div>
                    <h5>Homepage Gallery</h5>
                    <p>
                      Manage the images displayed on your customer homepage.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  className="settings-primary-btn"
                  onClick={() => setShowPostForm(true)}
                >
                  <i className="bi bi-plus-lg me-2"></i>
                  Post New
                </Button>
              </div>

              <div className="gallery-count">
                <span>
                  <i className="bi bi-images me-2"></i>
                  Uploaded Images
                </span>

                <strong>{posts.length}</strong>
              </div>

              {posts.length === 0 ? (
                <div className="settings-empty-gallery">
                  <div className="empty-gallery-icon">
                    <i className="bi bi-images"></i>
                  </div>

                  <h6>No Gallery Images Yet</h6>

                  <p>
                    Add images to display on your customer homepage.
                  </p>

                  <Button
                    type="button"
                    className="settings-primary-btn"
                    onClick={() => setShowPostForm(true)}
                  >
                    <i className="bi bi-plus-lg me-2"></i>
                    Add First Image
                  </Button>
                </div>
              ) : (
                <Row className="g-4 settings-gallery-grid">
                  {posts.map((post) => (
                    <Col
                      key={post.id}
                      xs={12}
                      sm={6}
                      md={4}
                      lg={3}
                      xl={3}
                    >
                      <Card className="settings-gallery-card">
                        <div className="settings-gallery-image">
                          <img
                            src={getImageUrl(post.image_path)}
                            alt={post.image_name}
                            loading="lazy"
                          />
                        </div>

                        <Card.Body>
                          <div className="gallery-card-info">
                            <h6 title={post.image_name}>
                              {post.image_name}
                            </h6>

                            <span>
                              <i className="bi bi-calendar3 me-1"></i>
                              {post.posted_at
                                ? new Date(
                                    post.posted_at
                                  ).toLocaleDateString()
                                : "Recently uploaded"}
                            </span>
                          </div>

                          <Button
                            type="button"
                            variant="outline-danger"
                            className="gallery-delete-btn"
                            onClick={() => handleDeletePost(post)}
                            disabled={deletingId === post.id}
                          >
                            {deletingId === post.id ? (
                              <>
                                <Spinner size="sm" className="me-2" />
                                Deleting...
                              </>
                            ) : (
                              <>
                                <i className="bi bi-trash3 me-2"></i>
                                Delete Image
                              </>
                            )}
                          </Button>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </Card.Body>
          </Card>

          {/* FUTURE SETTINGS SECTIONS */}
          <div className="settings-coming-soon">
            <i className="bi bi-sliders2"></i>

            <div>
              <h6>More Settings</h6>
              <p>
                Payment, store information, order, and account security
                settings can be added here later.
              </p>
            </div>
          </div>
        </>
      )}

      {/* POST NEW IMAGE MODAL */}
      <Modal
        show={showPostForm}
        onHide={handleClosePostForm}
        centered
        size="md"
        className="settings-post-modal"
        backdrop={postUploading ? "static" : true}
        keyboard={!postUploading}
      >
        <Modal.Header closeButton={!postUploading}>
          <Modal.Title>
            <i className="bi bi-cloud-arrow-up me-2"></i>
            Post New Homepage Image
          </Modal.Title>
        </Modal.Header>

        <Form onSubmit={handleCreatePost}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Image Name</Form.Label>

              <Form.Control
                type="text"
                placeholder="Example: Fresh Vegetables"
                value={imageName}
                onChange={(event) => setImageName(event.target.value)}
                maxLength={180}
                required
              />

              <Form.Text className="text-muted">
                Enter a short name for this homepage image.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Select Image</Form.Label>

              <Form.Control
                ref={galleryInputRef}
                type="file"
                accept="image/*,.jfif"
                onChange={handleImageSelect}
                required={!selectedImage}
              />

              <Form.Text className="text-muted">
                Maximum file size: 5 MB.
              </Form.Text>
            </Form.Group>

            {/* FIXED IMAGE PREVIEW */}
            {selectedImage && previewImage && (
              <div className="settings-upload-preview">
                <img
                  src={previewImage}
                  alt="Selected image preview"
                />

                <div>
                  <strong>{selectedImage.name}</strong>

                  <span>
                    {(
                      selectedImage.size /
                      (1024 * 1024)
                    ).toFixed(2)}{" "}
                    MB
                  </span>
                </div>
              </div>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button
              type="button"
              variant="light"
              onClick={handleClosePostForm}
              disabled={postUploading}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              className="settings-primary-btn"
              disabled={postUploading || !selectedImage}
            >
              {postUploading ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Uploading...
                </>
              ) : (
                <>
                  <i className="bi bi-upload me-2"></i>
                  Upload Image
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}

export default OwnerSettings;
