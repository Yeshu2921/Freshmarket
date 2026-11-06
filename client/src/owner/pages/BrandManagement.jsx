
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Form, InputGroup, Modal, Spinner,
  Table,
} from "react-bootstrap";
import "./BrandManagement.css";

const API = "http://localhost:5134/api";

const emptyForm = {
  brand_name: "",
  description: "",
};

function getToken() {
  return sessionStorage.getItem("freshmartToken");
}

async function apiRequest(path, options = {}) {
  const token = getToken();

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "The request failed.");
  }

  return data;
}

export default function BrandManagement() {
  const [brands, setBrands] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [pendingStatus, setPendingStatus] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadBrands = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError("");

    try {
      const result = await apiRequest("/brands");
      setBrands(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message || "Unable to load brands.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const counts = useMemo(
    () => ({
      total: brands.length,
      active: brands.filter((brand) => Boolean(brand.is_active)).length,
      inactive: brands.filter((brand) => !Boolean(brand.is_active)).length,
    }),
    [brands]
  );

  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase();

    return brands.filter((brand) => {
      const matchesSearch =
        !query ||
        String(brand.brand_name || "").toLowerCase().includes(query) ||
        String(brand.description || "").toLowerCase().includes(query);

      const active = Boolean(brand.is_active);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && active) ||
        (statusFilter === "inactive" && !active);

      return matchesSearch && matchesStatus;
    });
  }, [brands, search, statusFilter]);

  function openAddModal() {
    setEditingBrand(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEditModal(brand) {
    setEditingBrand(brand);
    setForm({
      brand_name: brand.brand_name || "",
      description: brand.description || "",
    });
    setError("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingBrand(null);
    setForm(emptyForm);
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const brandName = form.brand_name.trim();

    if (!brandName) {
      setError("Please enter a brand name.");
      return;
    }

    setSaving(true);

    try {
      const isEditing = Boolean(editingBrand);

      const result = await apiRequest(
        isEditing ? `/brands/${editingBrand.id}` : "/brands",
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify({
            brand_name: brandName,
            description: form.description.trim() || null,
          }),
        }
      );

      setNotice(
        result.message ||
          (isEditing
            ? "Brand updated successfully."
            : "Brand created successfully.")
      );

      setShowModal(false);
      setEditingBrand(null);
      setForm(emptyForm);

      await loadBrands(false);
    } catch (err) {
      setError(err.message || "Unable to save the brand.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange() {
    if (!pendingStatus) return;

    setChangingStatus(true);
    setError("");
    setNotice("");

    try {
      const { id, is_active } = pendingStatus;

      const result = await apiRequest(`/brands/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !is_active }),
      });

      setNotice(result.message || "Brand status updated.");
      setPendingStatus(null);

      await loadBrands(false);
    } catch (err) {
      setError(err.message || "Unable to update brand status.");
    } finally {
      setChangingStatus(false);
    }
  }

  async function handleDeleteBrand() {
    if (!pendingDelete) return;

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest(`/brands/${pendingDelete.id}`, {
        method: "DELETE",
      });

      setNotice(result.message || "Brand deleted successfully.");
      setPendingDelete(null);

      await loadBrands(false);
    } catch (err) {
      setError(
        err.message ||
          "Unable to delete this brand. It may be used by existing products."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="brand-page">
      <div className="brand-page-header">
        <div className="brand-heading">
          <div className="brand-heading-icon">
            <i className="bi bi-bookmark-star" />
          </div>

          <div>
            <h2>Brand Management</h2>
            <p>Manage the brands available in your supermarket.</p>
          </div>
        </div>

        <Button className="brand-add-button" onClick={openAddModal}>
          <i className="bi bi-plus-lg me-2" />
          Add Brand
        </Button>
      </div>

      {error && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => setError("")}
          className="brand-alert"
        >
          <i className="bi bi-exclamation-circle me-2" />
          {error}
        </Alert>
      )}

      {notice && (
        <Alert
          variant="success"
          dismissible
          onClose={() => setNotice("")}
          className="brand-alert"
        >
          <i className="bi bi-check-circle me-2" />
          {notice}
        </Alert>
      )}

      <div className="brand-stats">
        <div className="brand-stat-card">
          <div className="brand-stat-icon total">
            <i className="bi bi-bookmarks" />
          </div>
          <div>
            <span>Total Brands</span>
            <strong>{counts.total}</strong>
          </div>
        </div>

        <div className="brand-stat-card">
          <div className="brand-stat-icon active">
            <i className="bi bi-check-circle" />
          </div>
          <div>
            <span>Active Brands</span>
            <strong>{counts.active}</strong>
          </div>
        </div>

        <div className="brand-stat-card">
          <div className="brand-stat-icon inactive">
            <i className="bi bi-slash-circle" />
          </div>
          <div>
            <span>Inactive Brands</span>
            <strong>{counts.inactive}</strong>
          </div>
        </div>
      </div>

      <section className="brand-table-card">
        <div className="brand-toolbar">
          <div>
            <h5>All Brands</h5>
            <p>Search, edit, and manage brand status.</p>
          </div>

          <div className="brand-filters">
            <InputGroup className="brand-search">
              <InputGroup.Text>
                <i className="bi bi-search" />
              </InputGroup.Text>

              <Form.Control
                type="search"
                placeholder="Search brands..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search brands"
              />
            </InputGroup>

            <Form.Select
              className="brand-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by brand status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Form.Select>
          </div>
        </div>

        <div className="brand-table-scroll">
          <Table hover responsive className="brand-table align-middle mb-0">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Description</th>
                <th>Status</th>
                <th>Created</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="brand-empty">
                    <Spinner
                      animation="border"
                      size="sm"
                      className="me-2"
                    />
                    Loading brands...
                  </td>
                </tr>
              ) : filteredBrands.length === 0 ? (
                <tr>
                  <td colSpan={5} className="brand-empty">
                    <i className="bi bi-inbox" />

                    <strong>
                      {brands.length === 0
                        ? "No brands yet"
                        : "No matching brands"}
                    </strong>

                    <span>
                      {brands.length === 0
                        ? "Use Add Brand to create your first brand."
                        : "Try another search or status filter."}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredBrands.map((brand) => {
                  const active = Boolean(brand.is_active);

                  return (
                    <tr key={brand.id}>
                      <td>
                        <div className="brand-name-cell">
                          <div className="brand-row-icon">
                            <i className="bi bi-bookmark-star" />
                          </div>

                          <div>
                            <strong>{brand.brand_name}</strong>
                            <small>Brand #{brand.id}</small>
                          </div>
                        </div>
                      </td>

                      <td className="brand-description">
                        {brand.description || (
                          <span className="brand-muted">
                            No description
                          </span>
                        )}
                      </td>

                      <td>
                        <Badge
                          bg={active ? "success" : "secondary"}
                          className="brand-status-badge"
                        >
                          {active ? "Active" : "Inactive"}
                        </Badge>
                      </td>

                      <td className="brand-date">
                        {brand.created_at
                          ? new Date(brand.created_at).toLocaleDateString()
                          : "—"}
                      </td>

                      <td>
                        <div className="brand-actions">
                          <Button
                            size="sm"
                            variant="light"
                            className="brand-action edit"
                            title="Edit brand"
                            aria-label={`Edit ${brand.brand_name}`}
                            onClick={() => openEditModal(brand)}
                          >
                            <i className="bi bi-pencil-square" />
                          </Button>

                          <Button
                            size="sm"
                            variant="light"
                            className={`brand-action ${
                              active ? "deactivate" : "activate"
                            }`}
                            title={
                              active
                                ? "Deactivate brand"
                                : "Activate brand"
                            }
                            aria-label={`${
                              active ? "Deactivate" : "Activate"
                            } ${brand.brand_name}`}
                            onClick={() =>
                              setPendingStatus({
                                id: brand.id,
                                brand_name: brand.brand_name,
                                is_active: active,
                              })
                            }
                          >
                            <i
                              className={`bi ${
                                active ? "bi-toggle-on" : "bi-toggle-off"
                              }`}
                            />
                          </Button>

                          <Button
                            size="sm"
                            variant="light"
                            className="brand-action delete"
                            title="Delete brand"
                            aria-label={`Delete ${brand.brand_name}`}
                            onClick={() => setPendingDelete(brand)}
                          >
                            <i className="bi bi-trash3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>

        <div className="brand-table-footer">
          <span>
            Showing <strong>{filteredBrands.length}</strong> of{" "}
            <strong>{brands.length}</strong> brands
          </span>

          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => loadBrands()}
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise me-1" />
            Refresh
          </Button>
        </div>
      </section>

      {/* Add / Edit Brand Modal */}
      <Modal
        show={showModal}
        onHide={closeModal}
        centered
        size="md"
        className="brand-modal"
        backdrop={saving ? "static" : true}
      >
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton={!saving}>
            <div>
              <Modal.Title>
                {editingBrand ? "Edit Brand" : "Add New Brand"}
              </Modal.Title>

              <div className="brand-modal-subtitle">
                {editingBrand
                  ? "Update the brand information."
                  : "Enter the details for the new brand."}
              </div>
            </div>
          </Modal.Header>

          <Modal.Body>
            {error && (
              <Alert
                variant="danger"
                dismissible
                onClose={() => setError("")}
              >
                {error}
              </Alert>
            )}

            <Form.Group className="mb-3" controlId="brandName">
              <Form.Label>
                Brand Name <span className="text-danger">*</span>
              </Form.Label>

              <Form.Control
                type="text"
                name="brand_name"
                placeholder="e.g. Coca-Cola"
                value={form.brand_name}
                onChange={handleFormChange}
                maxLength={150}
                required
                autoFocus
              />

              <Form.Text className="text-muted">
                Brand names must be unique.
              </Form.Text>
            </Form.Group>

            <Form.Group controlId="brandDescription">
              <Form.Label>Description</Form.Label>

              <Form.Control
                as="textarea"
                rows={4}
                name="description"
                placeholder="Optional brand description..."
                value={form.description}
                onChange={handleFormChange}
              />
            </Form.Group>
          </Modal.Body>

          <Modal.Footer>
            <Button
              variant="light"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              className="brand-add-button"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Saving...
                </>
              ) : (
                <>
                  <i className="bi bi-check2 me-2" />
                  {editingBrand ? "Save Changes" : "Create Brand"}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Activate / Deactivate Confirmation */}
      <Modal
        show={Boolean(pendingStatus)}
        onHide={() => !changingStatus && setPendingStatus(null)}
        centered
        size="sm"
      >
        <Modal.Header closeButton={!changingStatus}>
          <Modal.Title className="fs-5">
            {pendingStatus?.is_active
              ? "Deactivate Brand?"
              : "Activate Brand?"}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {pendingStatus?.is_active
            ? `Deactivate "${pendingStatus?.brand_name}"? It will no longer be available as an active brand.`
            : `Activate "${pendingStatus?.brand_name}" again?`}
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="light"
            onClick={() => setPendingStatus(null)}
            disabled={changingStatus}
          >
            Cancel
          </Button>

          <Button
            variant={pendingStatus?.is_active ? "danger" : "success"}
            onClick={handleStatusChange}
            disabled={changingStatus}
          >
            {changingStatus ? (
              <Spinner size="sm" />
            ) : pendingStatus?.is_active ? (
              "Deactivate"
            ) : (
              "Activate"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Safe Delete Confirmation */}
      <Modal
        show={Boolean(pendingDelete)}
        onHide={() => !deleting && setPendingDelete(null)}
        centered
        size="sm"
        backdrop={deleting ? "static" : true}
      >
        <Modal.Header closeButton={!deleting}>
          <Modal.Title className="fs-5">
            <i className="bi bi-exclamation-triangle text-danger me-2" />
            Delete Brand?
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <p className="mb-2">
            Are you sure you want to delete this brand?
          </p>

          <div className="p-3 rounded border bg-light">
            <strong>{pendingDelete?.brand_name}</strong>
            <div className="small text-muted mt-1">
              Brand #{pendingDelete?.id}
            </div>
          </div>

          <p className="small text-danger mt-3 mb-0">
             If products use this brand, You can't delet
          </p>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="light"
            onClick={() => setPendingDelete(null)}
            disabled={deleting}
          >
            Cancel
          </Button>

          <Button
            variant="danger"
            onClick={handleDeleteBrand}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Spinner size="sm" className="me-2" />
                Deleting...
              </>
            ) : (
              <>
                <i className="bi bi-trash3 me-2" />
                Delete Brand
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
