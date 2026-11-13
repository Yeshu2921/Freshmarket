
const db = require("../db");

// GET /api/brands

async function getAllBrands(req, res) {
  try {
    const [brands] = await db.execute(`
      SELECT
        id,
        brand_name,
        description,
        is_active,
        created_at,
        updated_at
      FROM brands
      ORDER BY brand_name ASC
    `);

    return res.json({
      success: true,
      data: brands,
    });
  } catch (error) {
    console.error("Get brands error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve brands.",
    });
  }
}

// POST /api/brands
// POST /api/brands
async function createBrand(req, res) {
  const connection = await db.getConnection();

  try {
    const brandName =
      typeof req.body.brand_name === "string"
        ? req.body.brand_name.trim()
        : "";

    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim() || null
        : null;

    if (!brandName) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required.",
      });
    }

    if (brandName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Brand name must not exceed 150 characters.",
      });
    }

    await connection.beginTransaction();

    const [existing] = await connection.execute(
      "SELECT id FROM brands WHERE brand_name = ? LIMIT 1",
      [brandName]
    );

    if (existing.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "This brand already exists.",
      });
    }

    // Generate a new ID using the shared ID generator.
    const [sequenceResult] = await connection.execute(
      "INSERT INTO user_id_generator () VALUES ()"
    );

    const brandId = Number(sequenceResult.insertId);

    // Insert the brand with its generated ID.
    await connection.execute(
      `INSERT INTO brands (id, brand_name, description)
       VALUES (?, ?, ?)`,
      [brandId, brandName, description]
    );

    const [rows] = await connection.execute(
      "SELECT * FROM brands WHERE id = ?",
      [brandId]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Brand created successfully.",
      data: rows[0],
    });
  } catch (error) {
    await connection.rollback();

    console.error("Create brand error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This brand already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create brand.",
    });
  } finally {
    connection.release();
  }
}
// PUT /api/brands/:id
async function updateBrand(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand ID.",
      });
    }

    const brandName =
      typeof req.body.brand_name === "string"
        ? req.body.brand_name.trim()
        : "";

    const description =
      typeof req.body.description === "string"
        ? req.body.description.trim() || null
        : null;

    if (!brandName) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required.",
      });
    }

    if (brandName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Brand name must not exceed 150 characters.",
      });
    }

    const [existing] = await db.execute(
      "SELECT id FROM brands WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Brand not found.",
      });
    }

    const [duplicate] = await db.execute(
      `SELECT id
       FROM brands
       WHERE brand_name = ? AND id <> ?
       LIMIT 1`,
      [brandName, id]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Another brand already uses this name.",
      });
    }

    await db.execute(
      `UPDATE brands
       SET brand_name = ?, description = ?
       WHERE id = ?`,
      [brandName, description, id]
    );

    const [rows] = await db.execute(
      "SELECT * FROM brands WHERE id = ?",
      [id]
    );

    return res.json({
      success: true,
      message: "Brand updated successfully.",
      data: rows[0],
    });
  } catch (error) {
    console.error("Update brand error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This brand already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update brand.",
    });
  }
}

// PATCH /api/brands/:id/status
async function updateBrandStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand ID.",
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
      "UPDATE brands SET is_active = ? WHERE id = ?",
      [Boolean(is_active), id]
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.execute(
        "SELECT id FROM brands WHERE id = ?",
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Brand not found.",
        });
      }
    }

    return res.json({
      success: true,
      message: `Brand ${
        Boolean(is_active) ? "activated" : "deactivated"
      } successfully.`,
    });
  } catch (error) {
    console.error("Update brand status error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update brand status.",
    });
  }
}

// DELETE /api/brands/:id
// Prevent deleting brands that are used by existing products.
async function deleteBrand(req, res) {
  const connection = await db.getConnection();

  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid brand ID.",
      });
    }

    await connection.beginTransaction();

    // 1. Confirm the brand exists and lock its row.
    const [brands] = await connection.execute(
      "SELECT id, brand_name FROM brands WHERE id = ? FOR UPDATE",
      [id]
    );

    if (brands.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Brand not found.",
      });
    }

    const brand = brands[0];

    // 2. Check whether the products table exists.
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'products'`
    );

    if (tables.length > 0) {
      // 3. Confirm the table contains brand_id.
      const [columns] = await connection.execute(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'products'
           AND COLUMN_NAME = 'brand_id'`
      );

      if (columns.length > 0) {
        // 4. If any products use this brand, prevent deletion.
        const [references] = await connection.execute(
          "SELECT COUNT(*) AS total FROM products WHERE brand_id = ?",
          [id]
        );

        const total = Number(references[0].total);

        if (total > 0) {
          await connection.rollback();

          return res.status(409).json({
            success: false,
            message:
              `Cannot delete "${brand.brand_name}" because ` +
              `${total} product(s) use it. Deactivate the brand instead.`,
          });
        }
      }
    }

    // 5. Delete only when the product-reference check allows it.
    await connection.execute(
      "DELETE FROM brands WHERE id = ?",
      [id]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Brand "${brand.brand_name}" deleted successfully.`,
    });
  } catch (error) {
    await connection.rollback();

    console.error("Delete brand error:", error);

    if (
      error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_ROW_IS_REFERENCED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This brand is referenced by another database record. " +
          "Delete or update the related record first, or deactivate the brand.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete brand. Check the backend console for details.",
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllBrands,
  createBrand,
  updateBrand,
  updateBrandStatus,
  deleteBrand,
};
