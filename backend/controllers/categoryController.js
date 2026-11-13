
const db = require("../db");

// GET /api/categories/public
// Public endpoint for the shopping sidebar.
// Returns active categories whose parent is also active.
async function getPublicCategories(req, res) {
  try {
    const [categories] = await db.execute(`
      SELECT
        c.id,
        c.category_name,
        c.parent_id,
        p.category_name AS parent_name
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      WHERE c.is_active = 1
        AND (c.parent_id IS NULL OR p.is_active = 1)
      ORDER BY
        COALESCE(c.parent_id, c.id) ASC,
        c.category_name ASC,
        c.id ASC
    `);

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Get public categories error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve public categories.",
    });
  }
}

// GET /api/categories
// Returns all categories, including inactive categories.
async function getAllCategories(req, res) {
  try {
    const { search = "", status = "all", parent_id } = req.query;

    let sql = `
      SELECT
        c.id,
        c.category_name,
        c.parent_id,
        p.category_name AS parent_name,
        c.description,
        c.is_active,
        c.created_at
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      WHERE 1 = 1
    `;

    const params = [];

    if (typeof search === "string" && search.trim()) {
      sql += " AND c.category_name LIKE ?";
      params.push(`%${search.trim()}%`);
    }

    if (status === "active") {
      sql += " AND c.is_active = 1";
    } else if (status === "inactive") {
      sql += " AND c.is_active = 0";
    }

    if (parent_id !== undefined) {
      if (parent_id === "null" || parent_id === "") {
        sql += " AND c.parent_id IS NULL";
      } else {
        const parentId = Number(parent_id);

        if (!Number.isSafeInteger(parentId) || parentId < 1) {
          return res.status(400).json({
            success: false,
            message: "Invalid parent category ID.",
          });
        }

        sql += " AND c.parent_id = ?";
        params.push(parentId);
      }
    }

    sql += " ORDER BY c.category_name ASC, c.id ASC";

    const [categories] = await db.execute(sql, params);

    return res.json({ success: true, data: categories });
  } catch (error) {
    console.error("Get categories error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve categories.",
    });
  }
}

// GET /api/categories/parents
async function getParentCategories(req, res) {
  try {
    const [categories] = await db.execute(`
      SELECT id, category_name, parent_id
      FROM categories
      WHERE is_active = 1
      ORDER BY category_name ASC
    `);

    return res.json({ success: true, data: categories });
  } catch (error) {
    console.error("Get parent categories error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve parent categories.",
    });
  }
}

// POST /api/categories

// POST /api/categories
async function createCategory(req, res) {
  let connection;
  let transactionStarted = false;

  try {
    const categoryName =
      typeof req.body?.category_name === "string"
        ? req.body.category_name.trim()
        : "";

    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim() || null
        : null;

    const rawParentId = req.body?.parent_id;

    const parentId =
      rawParentId === undefined ||
      rawParentId === null ||
      rawParentId === ""
        ? null
        : Number(rawParentId);

    // Validate category name.
    if (!categoryName) {
      return res.status(400).json({
        success: false,
        message: "Category name is required.",
      });
    }

    if (categoryName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Category name must not exceed 150 characters.",
      });
    }

    // Validate parent ID.
    if (
      parentId !== null &&
      (!Number.isSafeInteger(parentId) || parentId < 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid parent category ID.",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Check that the selected parent exists.
    if (parentId !== null) {
      const [parents] = await connection.execute(
        `SELECT id
         FROM categories
         WHERE id = ?
         FOR UPDATE`,
        [parentId]
      );

      if (parents.length === 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "The selected parent category does not exist.",
        });
      }
    }

    // Generate a new ID using the existing generator table.
    const [sequenceResult] = await connection.execute(
      "INSERT INTO user_id_generator () VALUES ()"
    );

    const categoryId = Number(sequenceResult.insertId);

    if (!Number.isSafeInteger(categoryId) || categoryId < 1) {
      throw new Error("Failed to generate category ID.");
    }

    // Insert category with generated ID.
    await connection.execute(
      `INSERT INTO categories (
         id,
         category_name,
         parent_id,
         description
       )
       VALUES (?, ?, ?, ?)`,
      [
        categoryId,
        categoryName,
        parentId,
        description,
      ]
    );

    // Get the newly created category.
    const [rows] = await connection.execute(
      `SELECT
         c.id,
         c.category_name,
         c.parent_id,
         p.category_name AS parent_name,
         c.description,
         c.is_active,
         c.created_at
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE c.id = ?`,
      [categoryId]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      data: rows[0],
    });

  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback().catch(() => {});
    }

    console.error("Create category error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This category ID or another unique value already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create category.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
}


// PUT /api/categories/:id
async function updateCategory(req, res) {
  let connection;

  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const categoryName =
      typeof req.body.category_name === "string"
        ? req.body.category_name.trim()
        : "";

    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim() || null
        : null;

    const rawParentId = req.body.parent_id;
    const parentId =
      rawParentId === undefined ||
      rawParentId === null ||
      rawParentId === ""
        ? null
        : Number(rawParentId);

    if (!categoryName) {
      return res.status(400).json({
        success: false,
        message: "Category name is required.",
      });
    }

    if (categoryName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Category name must not exceed 150 characters.",
      });
    }

    if (
      parentId !== null &&
      (!Number.isSafeInteger(parentId) || parentId < 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid parent category ID.",
      });
    }

    if (parentId === id) {
      return res.status(400).json({
        success: false,
        message: "A category cannot be its own parent.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [currentRows] = await connection.execute(
      "SELECT id FROM categories WHERE id = ? FOR UPDATE",
      [id]
    );

    if (currentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    if (parentId !== null) {
      const [parentRows] = await connection.execute(
        "SELECT id FROM categories WHERE id = ? FOR UPDATE",
        [parentId]
      );

      if (parentRows.length === 0) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "The selected parent category does not exist.",
        });
      }

      // Prevent this category from becoming its own ancestor.
      const [descendants] = await connection.execute(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM categories WHERE parent_id = ?
           UNION ALL
           SELECT c.id
           FROM categories c
           INNER JOIN descendants d ON c.parent_id = d.id
         )
         SELECT id FROM descendants WHERE id = ? LIMIT 1`,
        [id, parentId]
      );

      if (descendants.length > 0) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "A subcategory cannot become an ancestor of itself.",
        });
      }
    }

    await connection.execute(
      `UPDATE categories
       SET category_name = ?, parent_id = ?, description = ?
       WHERE id = ?`,
      [categoryName, parentId, description, id]
    );

    await connection.commit();

    const [rows] = await db.execute(
      `SELECT c.id, c.category_name, c.parent_id,
              p.category_name AS parent_name,
              c.description, c.is_active, c.created_at
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE c.id = ?`,
      [id]
    );

    return res.json({
      success: true,
      message: "Category updated successfully.",
      data: rows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Update category error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update category.",
    });
  } finally {
    if (connection) connection.release();
  }
}

// PATCH /api/categories/:id/status
async function updateCategoryStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    if (
      typeof is_active !== "boolean" &&
      is_active !== 0 &&
      is_active !== 1
    ) {
      return res.status(400).json({
        success: false,
        message: "is_active must be true or false.",
      });
    }

    const [result] = await db.execute(
      "UPDATE categories SET is_active = ? WHERE id = ?",
      [Boolean(is_active), id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.execute(
        "SELECT id FROM categories WHERE id = ?",
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Category not found.",
        });
      }
    }

    return res.json({
      success: true,
      message: `Category ${
        Boolean(is_active) ? "activated" : "deactivated"
      } successfully.`,
    });
  } catch (error) {
    console.error("Update category status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update category status.",
    });
  }
}

// DELETE /api/categories/:id
// Safely deletes a category only when no related records prevent deletion.
async function deleteCategory(req, res) {
  let connection;

  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [categories] = await connection.execute(
      `SELECT id, category_name
       FROM categories
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (categories.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    const category = categories[0];

    // Protect subcategories before attempting deletion.
    const [children] = await connection.execute(
      "SELECT COUNT(*) AS total FROM categories WHERE parent_id = ?",
      [id]
    );

    if (Number(children[0].total) > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          `Cannot delete "${category.category_name}" because it has subcategories. ` +
          "Move or delete its subcategories first.",
      });
    }

    // Check optional related tables and columns before querying them.
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'products',
           'supplier_submissions'
         )`
    );

    const existingTables = new Set(
      tables.map((row) => row.TABLE_NAME)
    );

    const referenceChecks = [
      { table: "products", column: "category_id", label: "products" },
      {
        table: "supplier_submissions",
        column: "category_id",
        label: "supplier submissions",
      },
    ];

    for (const check of referenceChecks) {
      if (!existingTables.has(check.table)) continue;

      const [columns] = await connection.execute(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [check.table, check.column]
      );

      if (columns.length === 0) continue;

      // Identifiers come only from the fixed list above.
      const [references] = await connection.execute(
        `SELECT COUNT(*) AS total
         FROM \`${check.table}\`
         WHERE \`${check.column}\` = ?`,
        [id]
      );

      const total = Number(references[0].total);

      if (total > 0) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            `Cannot delete "${category.category_name}" because ` +
            `${total} record(s) in ${check.label} use it. ` +
            "Change those records or deactivate the category instead.",
        });
      }
    }

    await connection.execute(
      "DELETE FROM categories WHERE id = ?",
      [id]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: `Category "${category.category_name}" deleted successfully.`,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Delete category error:", error);

    if (
      error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_ROW_IS_REFERENCED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This category is referenced by another database record. " +
          "It cannot be deleted safely. Deactivate it instead.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete category. Check the backend console.",
    });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getPublicCategories,
  getAllCategories,
  getParentCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
};
