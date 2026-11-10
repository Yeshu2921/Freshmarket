
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, InputGroup, Modal, Row, Spinner,
  Table,
} from "react-bootstrap";
import "./CategoryManagement.css";

const API = "http://localhost:5134/api";

const emptyForm = {
  category_name: "",
  parent_id: "",
  description: "",
};

function getToken() {
  return (
    sessionStorage.getItem("freshmartToken") ||
    localStorage.getItem("freshmartToken") ||
    ""
  );
}

async function request(url, options = {}) {
  const token = getToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || `Request failed (${response.status})`);
  }

  return result;
}

export default function CategoryManagement() {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);

    try {
      const result = await request(`${API}/categories`);
      setCategories(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      setNotice({ type: "danger", message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase();

    return categories.filter((category) => {
      const matchesSearch =
        !term ||
        category.category_name?.toLowerCase().includes(term) ||
        category.parent_name?.toLowerCase().includes(term) ||
        category.description?.toLowerCase().includes(term);

      const active = Boolean(category.is_active);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && active) ||
        (statusFilter === "inactive" && !active);

      return matchesSearch && matchesStatus;
    });
  }, [categories, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: categories.length,
      active: categories.filter((item) => Boolean(item.is_active)).length,
      inactive: categories.filter((item) => !Boolean(item.is_active)).length,
      subcategories: categories.filter((item) => item.parent_id != null).length,
    }),
    [categories]
  );

  function openAddForm() {
    setEditingCategory(null);
    setForm(emptyForm);
    setNotice(null);
    setShowForm(true);
  }

  function openEditForm(category) {
    setEditingCategory(category);
    setForm({
      category_name: category.category_name || "",
      parent_id: category.parent_id == null ? "" : String(category.parent_id),
      description: category.description || "",
    });
    setNotice(null);
    setShowForm(true);
  }

  function closeForm() {
    if (!saving) setShowForm(false);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    const payload = {
      category_name: form.category_name.trim(),
      parent_id: form.parent_id || null,
      description: form.description.trim(),
    };

    try {
      const isEditing = Boolean(editingCategory);
      const url = isEditing
        ? `${API}/categories/${editingCategory.id}`
        : `${API}/categories`;

      const result = await request(url, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setShowForm(false);
      setNotice({
        type: "success",
        message:
          result.message ||
          (isEditing
            ? "Category updated successfully."
            : "Category created successfully."),
      });

      await loadCategories();
    } catch (error) {
      setNotice({ type: "danger", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(category) {
    const nextStatus = !Boolean(category.is_active);
    setChangingStatus(category.id);
    setNotice(null);

    try {
      const result = await request(
        `${API}/categories/${category.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: nextStatus }),
        }
      );

      setNotice({
        type: "success",
        message: result.message || "Category status updated.",
      });

      await loadCategories();
    } catch (error) {
      setNotice({ type: "danger", message: error.message });
    } finally {
      setChangingStatus(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setNotice(null);

    try {
      const result = await request(
        `${API}/categories/${deleteTarget.id}`,
        { method: "DELETE" }
      );

      setDeleteTarget(null);
      setNotice({
        type: "success",
        message: result.message || "Category deleted successfully.",
      });

      await loadCategories();
    } catch (error) {
      setNotice({ type: "danger", message: error.message });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // Only active main categories can be selected as parents.
// Subcategories cannot contain other subcategories.
const parentOptions = categories.filter(
  (category) =>
    category.is_active &&
    category.parent_id == null &&
    category.id !== editingCategory?.id
);

  return (
    <div className="category-page">
      <div className="category-page-header">
        <div>
          
          <h2>Category Management</h2>
          <p>Organize your products into categories and subcategories.</p>
        </div>

        <Button className="category-add-btn" onClick={openAddForm}>
          <i className="bi bi-plus-lg me-2" />
          Add Category
        </Button>
      </div>

      {notice && (
        <Alert
          variant={notice.type}
          dismissible
          onClose={() => setNotice(null)}
          className="category-alert"
        >
          {notice.message}
        </Alert>
      )}

      <Row className="g-3 category-stat-row">
        <Col xs={6} xl={3}>
          <Card className="category-stat-card">
            <Card.Body>
              <div className="category-stat-icon total">
                <i className="bi bi-grid-3x3-gap" />
              </div>
              <div className="category-stat-label">Total Categories</div>
              <div className="category-stat-number">{stats.total}</div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} xl={3}>
          <Card className="category-stat-card">
            <Card.Body>
              <div className="category-stat-icon active">
                <i className="bi bi-check-circle" />
              </div>
              <div className="category-stat-label">Active</div>
              <div className="category-stat-number">{stats.active}</div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} xl={3}>
          <Card className="category-stat-card">
            <Card.Body>
              <div className="category-stat-icon inactive">
                <i className="bi bi-pause-circle" />
              </div>
              <div className="category-stat-label">Inactive</div>
              <div className="category-stat-number">{stats.inactive}</div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} xl={3}>
          <Card className="category-stat-card">
            <Card.Body>
              <div className="category-stat-icon subcategory">
                <i className="bi bi-diagram-2" />
              </div>
              <div className="category-stat-label">Subcategories</div>
              <div className="category-stat-number">
                {stats.subcategories}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="category-content-card">
        <Card.Body>
          <div className="category-toolbar">
            <InputGroup className="category-search">
              <InputGroup.Text>
                <i className="bi bi-search" />
              </InputGroup.Text>
              <Form.Control
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search category, parent, description..."
                aria-label="Search categories"
              />
              {search && (
                <Button
                  variant="outline-secondary"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <i className="bi bi-x-lg" />
                </Button>
              )}
            </InputGroup>

            <Form.Select
              className="category-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </Form.Select>

            <Button
              variant="outline-secondary"
              className="category-refresh-btn"
              onClick={loadCategories}
              disabled={loading}
              title="Refresh categories"
            >
              <i className="bi bi-arrow-clockwise me-1" />
              Refresh
            </Button>
          </div>

          <div className="category-table-heading">
            <div>
              <h5>Categories</h5>
              <span>
                Showing {filteredCategories.length} of {categories.length}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="category-loading">
              <Spinner animation="border" role="status" size="sm" />
              <span>Loading categories...</span>
            </div>
          ) : (
            <div className="table-responsive category-table-wrap">
              <Table hover className="category-table align-middle">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Parent Category</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCategories.map((category) => (
                    <tr key={category.id}>
                      <td>
                        <div className="category-name-cell">
                          <span className="category-row-icon">
                            <i
                              className={
                                category.parent_id == null
                                  ? "bi bi-folder2"
                                  : "bi bi-folder2-open"
                              }
                            />
                          </span>
                          <div>
                            <strong>{category.category_name}</strong>
                            <small>ID: {category.id}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        {category.parent_name ? (
                          <span className="category-parent-label">
                            <i className="bi bi-arrow-return-right me-1" />
                            {category.parent_name}
                          </span>
                        ) : (
                          <span className="category-root-label">
                            Main category
                          </span>
                        )}
                      </td>

                      <td>
                        <span
                          className="category-description"
                          title={category.description || ""}
                        >
                          {category.description || "—"}
                        </span>
                      </td>

                      <td>
                        <Badge
                          bg={category.is_active ? "success" : "secondary"}
                          className="category-status-badge"
                        >
                          {category.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>

                      <td className="category-date">
                        {category.created_at
                          ? new Date(category.created_at).toLocaleDateString()
                          : "—"}
                      </td>

                      <td>
                        <div className="category-actions">
                          <Button
                            size="sm"
                            className="category-action edit"
                            title="Edit category"
                            aria-label={`Edit ${category.category_name}`}
                            onClick={() => openEditForm(category)}
                          >
                            <i className="bi bi-pencil-square" />
                          </Button>

                          <Button
                            size="sm"
                            className="category-action status"
                            title={
                              category.is_active ? "Deactivate" : "Activate"
                            }
                            aria-label={`${
                              category.is_active ? "Deactivate" : "Activate"
                            } ${category.category_name}`}
                            disabled={changingStatus === category.id}
                            onClick={() => handleStatusChange(category)}
                          >
                            {changingStatus === category.id ? (
                              <Spinner size="sm" animation="border" />
                            ) : (
                              <i
                                className={
                                  category.is_active
                                    ? "bi bi-pause-circle"
                                    : "bi bi-check-circle"
                                }
                              />
                            )}
                          </Button>

                          <Button
                            size="sm"
                            className="category-action delete"
                            title="Delete category"
                            aria-label={`Delete ${category.category_name}`}
                            onClick={() => setDeleteTarget(category)}
                          >
                            <i className="bi bi-trash3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredCategories.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="category-empty">
                          <i className="bi bi-folder2-open" />
                          <h6>No categories found</h6>
                          <p>
                            {search || statusFilter !== "all"
                              ? "Try changing your search or filter."
                              : "Add your first category to get started."}
                          </p>
                          {!search && statusFilter === "all" && (
                            <Button
                              size="sm"
                              className="category-add-btn"
                              onClick={openAddForm}
                            >
                              <i className="bi bi-plus-lg me-1" />
                              Add Category
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Add/Edit modal */}
      <Modal
        show={showForm}
        onHide={closeForm}
        centered
        backdrop={saving ? "static" : true}
        keyboard={!saving}
        className="category-modal"
      >
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton={!saving}>
            <Modal.Title>
              <span className="category-modal-icon">
                <i
                  className={
                    editingCategory ? "bi bi-pencil-square" : "bi bi-folder-plus"
                  }
                />
              </span>
              {editingCategory ? "Edit Category" : "Add Category"}
            </Modal.Title>
          </Modal.Header>

          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>
                Category Name <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                name="category_name"
                value={form.category_name}
                onChange={updateField}
                maxLength={150}
                placeholder="e.g. Beverages"
                required
                autoFocus
              />
              <Form.Text className="text-muted">
                Use a clear, descriptive name.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Parent Category</Form.Label>
              <Form.Select
                name="parent_id"
                value={form.parent_id}
                onChange={updateField}
              >
                <option value="">None — Main category</option>
                {parentOptions.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.category_name}
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Choose a parent to create a subcategory.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="description"
                value={form.description}
                onChange={updateField}
                placeholder="Describe what belongs in this category..."
              />
            </Form.Group>
          </Modal.Body>

          <Modal.Footer>
            <Button
              variant="light"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="category-add-btn"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner size="sm" animation="border" className="me-2" />
                  Saving...
                </>
              ) : (
                <>
                  <i className="bi bi-check2 me-1" />
                  {editingCategory ? "Save Changes" : "Create Category"}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        show={Boolean(deleteTarget)}
        onHide={() => !deleting && setDeleteTarget(null)}
        centered
        className="category-modal"
        backdrop={deleting ? "static" : true}
        keyboard={!deleting}
      >
        <Modal.Body className="category-delete-body">
          <div className="category-delete-icon">
            <i className="bi bi-trash3" />
          </div>
          <h5>Delete Category?</h5>
          <p>
            Are you sure you want to delete{" "}
            <strong>{deleteTarget?.category_name}</strong>? This action cannot
            be undone. The server will prevent deletion if related records
            exist.
          </p>
          <div className="category-delete-actions">
            <Button
              variant="light"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Spinner size="sm" animation="border" className="me-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <i className="bi bi-trash3 me-1" />
                  Delete Category
                </>
              )}
            </Button>
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
}
