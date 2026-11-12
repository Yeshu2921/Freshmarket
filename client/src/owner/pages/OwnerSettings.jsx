
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

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const IMAGE_BASE = API_BASE.replace(/\/api\/?$/, "");

const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg", ".jpeg", ".jfif", ".png",
  ".webp", ".gif", ".bmp", ".avif",
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const emptyPaymentMethod = {
  method_name: "",
  receiver_name: "",
  account_number: "",
  account_type: "",
};

function OwnerSettings() {
  const token = sessionStorage.getItem("freshmartToken");

  const bannerInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const logoInputRef = useRef(null);

  // Homepage content.
  const [banner, setBanner] = useState(null);
  const [logo, setLogo] = useState(null);
  const [logoName, setLogoName] = useState("FreshMart");
  const [posts, setPosts] = useState([]);

  // Payment methods.
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentMethod);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);

  // Loading states.
  const [loading, setLoading] = useState(true);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [postUploading, setPostUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Gallery form.
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
  // AUTHORIZATION HEADERS
  // --------------------------------------------------

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

  // --------------------------------------------------
  // IMAGE URL
  // --------------------------------------------------

  const getImageUrl = (imagePath) => {
    if (!imagePath) return "";

    if (/^(https?:\/\/|data:|blob:)/i.test(imagePath)) {
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
  // LOAD PAYMENT METHODS
  // --------------------------------------------------

  const fetchPaymentMethods = useCallback(async () => {
    setPaymentLoading(true);

    try {
      const response = await fetch(
  `${API_BASE}/homepage/payment-methods`
);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load payment methods."
        );
      }

      setPaymentMethods(data.paymentMethods || []);
    } catch (error) {
      console.error("Load payment methods error:", error);

      setMessage({
        type: "danger",
        text: error.message || "Unable to load payment methods.",
      });
    } finally {
      setPaymentLoading(false);
    }
  }, []);

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

      // Load logo separately.
      try {
        const logoResponse = await fetch(
          `${API_BASE}/homepage/logo`
        );

        const logoData = await logoResponse.json();

        if (logoResponse.ok) {
          setLogo(logoData.logo || null);
          setLogoName(
            logoData.logo?.image_name || "FreshMart"
          );
        } else {
          console.warn(
            logoData.message || "Unable to load website logo."
          );
        }
      } catch (logoError) {
        console.warn("Unable to load website logo:", logoError);
      }
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
    fetchPaymentMethods();
  }, [fetchHomepageContent, fetchPaymentMethods]);

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

    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedImage]);

  // --------------------------------------------------
  // CHANGE HOMEPAGE BANNER
  // --------------------------------------------------

  const handleBannerChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const validationError = validateImage(file);

    if (validationError) {
      setMessage({ type: "danger", text: validationError });
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

      const response = await fetch(
        `${API_BASE}/homepage/banner`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update banner.");
      }

      if (data.banner) setBanner(data.banner);

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
  // CHANGE WEBSITE LOGO
  // --------------------------------------------------

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const validationError = validateImage(file);

    if (validationError) {
      setMessage({ type: "danger", text: validationError });
      return;
    }

    if (!logoName.trim()) {
      setMessage({
        type: "danger",
        text: "Please enter your website name before uploading the logo.",
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
      setLogoUploading(true);
      setMessage({ type: "", text: "" });

      const formData = new FormData();
      formData.append("image_name", logoName.trim());
      formData.append("image", file);

      const response = await fetch(
        `${API_BASE}/homepage/logo`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to update website logo."
        );
      }

      if (data.logo) {
        setLogo(data.logo);
        setLogoName(data.logo.image_name || logoName.trim());
      } else {
        const logoResponse = await fetch(
          `${API_BASE}/homepage/logo`
        );

        const logoData = await logoResponse.json();

        if (logoResponse.ok) {
          setLogo(logoData.logo || null);
          setLogoName(
            logoData.logo?.image_name || logoName.trim()
          );
        }
      }

      setMessage({
        type: "success",
        text: data.message || "Website logo updated successfully.",
      });
    } catch (error) {
      setMessage({
        type: "danger",
        text: error.message || "Unable to update website logo.",
      });
    } finally {
      setLogoUploading(false);
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
      setMessage({ type: "danger", text: validationError });
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
      setMessage({ type: "danger", text: "Please enter an image name." });
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
      setMessage({ type: "danger", text: "Please select an image." });
      return;
    }

    const validationError = validateImage(selectedImage);

    if (validationError) {
      setMessage({ type: "danger", text: validationError });
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

      const response = await fetch(
        `${API_BASE}/homepage/posts`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to upload image.");
      }

      if (data.post) {
        setPosts((previousPosts) => [
          data.post,
          ...previousPosts.filter(
            (post) => post.id !== data.post.id
          ),
        ]);
      } else {
        const postsResponse = await fetch(
          `${API_BASE}/homepage/posts`
        );

        const postsData = await postsResponse.json();

        if (!postsResponse.ok) {
          throw new Error(
            postsData.message ||
              "Image uploaded, but gallery could not refresh."
          );
        }

        setPosts(postsData.posts || []);
      }

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
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete image.");
      }

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
  // PAYMENT METHOD FORM
  // --------------------------------------------------

  const openAddPaymentForm = () => {
    setEditingPaymentId(null);
    setPaymentForm(emptyPaymentMethod);
    setShowPaymentForm(true);
  };

  const openEditPaymentForm = (payment) => {
    setEditingPaymentId(payment.id);

    setPaymentForm({
      method_name: payment.method_name || "",
      receiver_name: payment.receiver_name || "",
      account_number: payment.account_number || "",
      account_type: payment.account_type || "",
    });

    setShowPaymentForm(true);
  };

  const handlePaymentFormChange = (event) => {
    const { name, value } = event.target;

    setPaymentForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSavePaymentMethod = async (event) => {
    event.preventDefault();

    if (!token) {
      setMessage({
        type: "danger",
        text: "Your login session has expired. Please log in again.",
      });
      return;
    }

    const methodName = paymentForm.method_name.trim();
    const receiverName = paymentForm.receiver_name.trim();
    const accountNumber = paymentForm.account_number.trim();
    const accountType = paymentForm.account_type.trim();

    if (!methodName || !receiverName || !accountNumber || !accountType) {
      setMessage({
        type: "danger",
        text: "Please complete all payment method fields.",
      });
      return;
    }

    try {
      setPaymentSaving(true);
      setMessage({ type: "", text: "" });

      const isEditing = editingPaymentId !== null;

      const url = isEditing
  ? `${API_BASE}/homepage/payment-methods/${editingPaymentId}`
  : `${API_BASE}/homepage/payment-methods`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method_name: methodName,
          receiver_name: receiverName,
          account_number: accountNumber,
          account_type: accountType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to save payment method."
        );
      }

      // Refresh the list from the database.
      await fetchPaymentMethods();

      setShowPaymentForm(false);
      setPaymentForm(emptyPaymentMethod);
      setEditingPaymentId(null);

      setMessage({
        type: "success",
        text:
          data.message ||
          (isEditing
            ? "Payment method updated successfully."
            : "Payment method added successfully."),
      });
    } catch (error) {
      setMessage({
        type: "danger",
        text: error.message || "Unable to save payment method.",
      });
    } finally {
      setPaymentSaving(false);
    }
  };

  // --------------------------------------------------
  // DELETE PAYMENT METHOD
  // --------------------------------------------------

  const handleDeletePaymentMethod = async (payment) => {
    const confirmed = window.confirm(
      `Permanently delete "${payment.method_name}" payment method?`
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
      setDeletingPaymentId(payment.id);
      setMessage({ type: "", text: "" });

      const response = await fetch(
  `${API_BASE}/homepage/payment-methods/${payment.id}`,
  {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${sessionStorage.getItem("freshmartToken")}`,
    },
  }
);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to delete payment method."
        );
      }

      setPaymentMethods((previous) =>
        previous.filter((item) => item.id !== payment.id)
      );

      setMessage({
        type: "success",
        text: data.message || "Payment method permanently deleted.",
      });
    } catch (error) {
      setMessage({
        type: "danger",
        text: error.message || "Unable to delete payment method.",
      });
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // --------------------------------------------------
  // CLOSE MODALS
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

  const handleClosePaymentForm = () => {
    if (paymentSaving) return;

    setShowPaymentForm(false);
    setPaymentForm(emptyPaymentMethod);
    setEditingPaymentId(null);
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
            Manage your website logo, homepage banner, gallery images
            and payment methods.
          </p>
        </div>

        <Button
          type="button"
          className="settings-refresh-btn"
          onClick={() => {
            fetchHomepageContent();
            fetchPaymentMethods();
          }}
          disabled={loading || paymentLoading}
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
          {/* WEBSITE LOGO */}
          <Card className="settings-section-card logo-section">
            <Card.Body>
              <div className="settings-section-heading">
                <div>
                  <div className="settings-icon">
                    <i className="bi bi-shop"></i>
                  </div>

                  <div>
                    <h5>Website Logo</h5>
                    <p>
                      Manage the logo and brand name displayed in your website headers.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  className="settings-primary-btn"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                >
                  {logoUploading ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-cloud-arrow-up me-2"></i>
                      {logo?.image_path ? "Change Logo" : "Upload Logo"}
                    </>
                  )}
                </Button>

                <Form.Control
                  ref={logoInputRef}
                  type="file"
                  accept="image/*,.jfif"
                  className="d-none"
                  onChange={handleLogoChange}
                />
              </div>

              <Row className="align-items-center g-4 mt-2">
                <Col xs={12} md={4} lg={3}>
                  <div
                    className="settings-logo-preview"
                    style={{
                      minHeight: "150px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "16px",
                      border: "1px dashed #ced4da",
                      borderRadius: "12px",
                      background: "#f8f9fa",
                    }}
                  >
                    {logo?.image_path ? (
                      <img
                        src={getImageUrl(logo.image_path)}
                        alt="Current FreshMart website logo"
                        style={{
                          display: "block",
                          maxWidth: "100%",
                          maxHeight: "120px",
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <div className="text-center text-muted">
                        <i className="bi bi-image fs-1"></i>
                        <p className="mb-0 mt-2">No logo uploaded</p>
                      </div>
                    )}
                  </div>
                </Col>

                <Col xs={12} md={8} lg={9}>
                  <Form.Group>
                    <Form.Label>Website / Brand Name</Form.Label>

                    <Form.Control
                      type="text"
                      value={logoName}
                      onChange={(event) => setLogoName(event.target.value)}
                      placeholder="Enter your website name"
                      maxLength={180}
                    />

                    <Form.Text className="text-muted">
                      The name is saved together with the logo when you upload a new image.
                    </Form.Text>
                  </Form.Group>

                  <div className="settings-image-note mt-3">
                    <i className="bi bi-info-circle me-2"></i>
                    Supported image formats: JPG, JPEG, JFIF, PNG,
                    WEBP, GIF, BMP and AVIF. Maximum file size: 5 MB.
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>

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
                      This is the main banner displayed on your customer homepage.
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
                    <p>Choose an image to display on your homepage.</p>
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
                                ? new Date(post.posted_at).toLocaleDateString()
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

          {/* =========================================
              PAYMENT METHODS MANAGEMENT
          ========================================== */}

          <Card className="settings-section-card payment-section">
            <Card.Body>
              <div className="gallery-heading">
                <div className="settings-section-heading">
                  <div className="settings-icon">
                    <i className="bi bi-credit-card"></i>
                  </div>

                  <div>
                    <h5>Payment Methods</h5>
                    <p>
                      Manage the payment accounts customers see when placing orders.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  className="settings-primary-btn"
                  onClick={openAddPaymentForm}
                >
                  <i className="bi bi-plus-lg me-2"></i>
                  Add Payment Method
                </Button>
              </div>

              <div className="gallery-count">
                <span>
                  <i className="bi bi-wallet2 me-2"></i>
                  Available Payment Methods
                </span>

                <strong>{paymentMethods.length}</strong>
              </div>

              {paymentLoading ? (
                <div className="settings-loading">
                  <Spinner animation="border" variant="success" />
                  <p>Loading payment methods...</p>
                </div>
              ) : paymentMethods.length === 0 ? (
                <div className="settings-empty-gallery">
                  <div className="empty-gallery-icon">
                    <i className="bi bi-credit-card"></i>
                  </div>

                  <h6>No Payment Methods Yet</h6>

                  <p>
                    Add payment accounts so customers can choose
                    their preferred payment method.
                  </p>

                  <Button
                    type="button"
                    className="settings-primary-btn"
                    onClick={openAddPaymentForm}
                  >
                    <i className="bi bi-plus-lg me-2"></i>
                    Add First Payment Method
                  </Button>
                </div>
              ) : (
                <Row className="g-3">
                  {paymentMethods.map((payment) => (
                    <Col
                      key={payment.id}
                      xs={12}
                      md={6}
                      xl={4}
                    >
                      <Card className="payment-method-card h-100">
                        <Card.Body>
                          <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
                            <div className="payment-method-icon">
                              <i className="bi bi-bank"></i>
                            </div>

                            <span className="badge bg-success">
                              Active
                            </span>
                          </div>

                          <h5>{payment.method_name}</h5>

                          <div className="payment-method-details">
                            <p>
                              <strong>Receiver:</strong>{" "}
                              {payment.receiver_name}
                            </p>

                            <p>
                              <strong>Account:</strong>{" "}
                              {payment.account_number}
                            </p>

                            <p>
                              <strong>Account type:</strong>{" "}
                              {payment.account_type}
                            </p>
                          </div>

                          <div className="payment-method-actions">
                            <Button
                              type="button"
                              variant="outline-success"
                              size="sm"
                              onClick={() =>
                                openEditPaymentForm(payment)
                              }
                              disabled={deletingPaymentId === payment.id}
                            >
                              <i className="bi bi-pencil-square me-1"></i>
                              Edit
                            </Button>

                            <Button
                              type="button"
                              variant="outline-danger"
                              size="sm"
                              onClick={() =>
                                handleDeletePaymentMethod(payment)
                              }
                              disabled={deletingPaymentId === payment.id}
                            >
                              {deletingPaymentId === payment.id ? (
                                <>
                                  <Spinner size="sm" className="me-1" />
                                  Deleting
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-trash3 me-1"></i>
                                  Delete
                                </>
                              )}
                            </Button>
                          </div>
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
                Store information, order, and account security settings
                can be added here later.
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

            {selectedImage && previewImage && (
              <div className="settings-upload-preview">
                <img src={previewImage} alt="Selected image preview" />

                <div>
                  <strong>{selectedImage.name}</strong>

                  <span>
                    {(selectedImage.size / (1024 * 1024)).toFixed(2)} MB
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

      {/* ADD / EDIT PAYMENT METHOD MODAL */}
      <Modal
        show={showPaymentForm}
        onHide={handleClosePaymentForm}
        centered
        size="md"
        backdrop={paymentSaving ? "static" : true}
        keyboard={!paymentSaving}
      >
        <Modal.Header closeButton={!paymentSaving}>
          <Modal.Title>
            <i className="bi bi-credit-card me-2"></i>
            {editingPaymentId
              ? "Edit Payment Method"
              : "Add Payment Method"}
          </Modal.Title>
        </Modal.Header>

        <Form onSubmit={handleSavePaymentMethod}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Payment Method Name *</Form.Label>

              <Form.Control
                type="text"
                name="method_name"
                value={paymentForm.method_name}
                onChange={handlePaymentFormChange}
                placeholder="Example: Telebirr, CBE, Awash Bank"
                maxLength={100}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Receiver Name *</Form.Label>

              <Form.Control
                type="text"
                name="receiver_name"
                value={paymentForm.receiver_name}
                onChange={handlePaymentFormChange}
                placeholder="Enter account receiver name"
                maxLength={180}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Account Number *</Form.Label>

              <Form.Control
                type="text"
                name="account_number"
                value={paymentForm.account_number}
                onChange={handlePaymentFormChange}
                placeholder="Enter account or wallet number"
                maxLength={100}
                required
              />
            </Form.Group>

            <Form.Group>
              <Form.Label>Account Type *</Form.Label>

              <Form.Select
                name="account_type"
                value={paymentForm.account_type}
                onChange={handlePaymentFormChange}
                required
              >
                <option value="">Select account type</option>
                <option value="Bank account">Bank account</option>
                <option value="Mobile wallet">Mobile wallet</option>
                <option value="CBE Birr wallet">CBE Birr wallet</option>
                <option value="Telebirr wallet">Telebirr wallet</option>
                <option value="Other">Other</option>
              </Form.Select>
            </Form.Group>

            <Alert variant="info" className="mt-3 mb-0">
              Customers will see these details when they select this
              payment method during checkout.
            </Alert>
          </Modal.Body>

          <Modal.Footer>
            <Button
              type="button"
              variant="light"
              onClick={handleClosePaymentForm}
              disabled={paymentSaving}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              className="settings-primary-btn"
              disabled={paymentSaving}
            >
              {paymentSaving ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Saving...
                </>
              ) : (
                <>
                  <i className="bi bi-check-circle me-2"></i>
                  {editingPaymentId ? "Save Changes" : "Add Payment Method"}
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
