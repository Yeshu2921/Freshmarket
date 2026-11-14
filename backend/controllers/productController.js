
const db = require("../db");
const fs = require("fs");
const path = require("path");
const cloudinary = require("../config/cloudinary");

// ======================================================
// PRODUCT IMAGE DIRECTORY
// ======================================================

const uploadDirectory = path.join(
  __dirname,
  "..",
  "uploads",
  "products"
);

// ======================================================
// ID GENERATORS
// TiDB requires explicit IDs for these tables.
// ======================================================

async function generateProductId(connection) {
  const [result] = await connection.execute(
    "INSERT INTO product_id_generator () VALUES ()"
  );

  const id = Number(result.insertId);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Unable to generate product ID.");
  }

  return id;
}

async function generateProductImageId(connection) {
  const [result] = await connection.execute(
    "INSERT INTO product_image_id_generator () VALUES ()"
  );

  const id = Number(result.insertId);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Unable to generate product image ID.");
  }

  return id;
}

// ======================================================
// TEMPORARY FILE MANAGEMENT
// ======================================================

function removeUploadedFiles(files = []) {
  for (const file of files) {
    if (file?.path) {
      fs.unlink(file.path, (error) => {
        if (error && error.code !== "ENOENT") {
          console.error(
            "Could not remove temporary product image:",
            error.message
          );
        }
      });
    }
  }
}

// Remove legacy local images only.
// Never use this function for Cloudinary URLs.
function removeImageFile(imagePath) {
  if (
    !imagePath ||
    imagePath.startsWith("http://") ||
    imagePath.startsWith("https://")
  ) {
    return;
  }

  const filename = path.basename(imagePath);

  const fullPath = path.resolve(uploadDirectory, filename);
  const safeDirectory = path.resolve(uploadDirectory);

  if (path.dirname(fullPath) !== safeDirectory) {
    return;
  }

  fs.unlink(fullPath, (error) => {
    if (error && error.code !== "ENOENT") {
      console.error(
        "Could not remove legacy product image:",
        error.message
      );
    }
  });
}

// ======================================================
// CLOUDINARY IMAGE MANAGEMENT
// ======================================================

// Upload one temporary image to Cloudinary.
async function uploadProductImage(file) {
  const result = await cloudinary.uploader.upload(file.path, {
    folder: "freshmart/products",
    resource_type: "image",
  });

  return {
    image_path: result.secure_url,
    public_id: result.public_id,
  };
}

// Extract Cloudinary public ID from its URL.
function getCloudinaryPublicId(imageUrl) {
  if (
    !imageUrl ||
    typeof imageUrl !== "string" ||
    !imageUrl.includes("res.cloudinary.com")
  ) {
    return null;
  }

  try {
    const pathname = new URL(imageUrl).pathname;
    const uploadIndex = pathname.indexOf("/upload/");

    if (uploadIndex === -1) {
      return null;
    }

    let publicId = pathname.substring(uploadIndex + 8);

    // Remove version prefix, for example v123456789/
    publicId = publicId.replace(/^v\d+\//, "");

    // Remove file extension.
    publicId = publicId.replace(/\.[^/.]+$/, "");

    return decodeURIComponent(publicId);
  } catch (error) {
    console.error(
      "Could not extract Cloudinary public ID:",
      error.message
    );

    return null;
  }
}

// Delete one Cloudinary image.
async function deleteCloudinaryImage(imageUrl) {
  const publicId = getCloudinaryPublicId(imageUrl);

  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
  } catch (error) {
    console.error(
      "Cloudinary image deletion failed:",
      error.message
    );
  }
}

// Delete a stored image.
// Supports both Cloudinary URLs and old local paths.
async function deleteStoredImage(imagePath) {
  if (!imagePath) return;

  if (
    imagePath.startsWith("https://") ||
    imagePath.startsWith("http://")
  ) {
    await deleteCloudinaryImage(imagePath);
  } else {
    removeImageFile(imagePath);
  }
}

// Clean up Cloudinary uploads if the database transaction fails.
async function cleanupCloudinaryUploads(images = []) {
  for (const image of images) {
    if (image?.image_path) {
      await deleteCloudinaryImage(image.image_path);
    }
  }
}

// ======================================================
// PRODUCT VALIDATION
// ======================================================

function parseInteger(
  value,
  fieldName,
  { min = 0, required = true } = {}
) {
  if (
    (value === undefined || value === null || value === "") &&
    !required
  ) {
    return null;
  }

  if (
    value === undefined ||
    value === null ||
    value === "" ||
    !/^\d+$/.test(String(value))
  ) {
    throw new Error(
      `${fieldName} must be a valid whole number.`
    );
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < min) {
    throw new Error(
      `${fieldName} must be at least ${min}.`
    );
  }

  return number;
}

function parsePrice(
  value,
  fieldName,
  { optional = false } = {}
) {
  if (
    (value === undefined || value === null || value === "") &&
    optional
  ) {
    return null;
  }

  const number = Number(value);

  if (
    value === undefined ||
    value === null ||
    value === "" ||
    !Number.isFinite(number) ||
    number < 0 ||
    !/^\d+(\.\d{1,2})?$/.test(String(value))
  ) {
    throw new Error(
      `${fieldName} must be a valid non-negative price.`
    );
  }

  return number;
}

// ======================================================
// PRODUCT VALIDATION
// ======================================================

function validateProduct(body) {
  const name = String(body.name || "").trim();

  const description = String(
    body.description || ""
  ).trim();

  const sku =
    String(body.sku || "").trim() || null;

  const barcode =
    String(body.barcode || "").trim() || null;

  const unit = String(
    body.unit || "pieces"
  ).trim();

  const status = String(
    body.status || "Active"
  ).trim();

  if (!name || name.length > 180) {
    throw new Error(
      "Product name is required and must not exceed 180 characters."
    );
  }

  if (sku && sku.length > 80) {
    throw new Error("SKU must not exceed 80 characters.");
  }

  if (barcode && barcode.length > 100) {
    throw new Error("Barcode must not exceed 100 characters.");
  }

  if (!unit || unit.length > 30) {
    throw new Error(
      "Unit is required and must not exceed 30 characters."
    );
  }

  if (!["Active", "Inactive", "Archived"].includes(status)) {
    throw new Error("Invalid product status.");
  }

  const category_id = parseInteger(
    body.category_id,
    "Category ID",
    { min: 1 }
  );

  const brand_id = parseInteger(
    body.brand_id,
    "Brand ID",
    {
      min: 1,
      required: false,
    }
  );

  const quantity = parseInteger(
    body.quantity,
    "Quantity"
  );

  const selling_price = parsePrice(
    body.selling_price,
    "Selling price"
  );

  const discount_price = parsePrice(
    body.discount_price,
    "Discount price",
    { optional: true }
  );

  if (
    discount_price !== null &&
    discount_price >= selling_price
  ) {
    throw new Error(
      "Discount price must be lower than selling price."
    );
  }

  return {
    name,
    description: description || null,
    sku,
    barcode,
    category_id,
    brand_id,
    quantity,
    selling_price,
    discount_price,
    unit,
    status,
  };
}

// ======================================================
// REMOVED IMAGE VALIDATION
// ======================================================

function parseRemovedImages(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return [];
  }

  let parsed;

  try {
    parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : value;
  } catch {
    throw new Error(
      "removed_images must be a valid JSON array."
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "removed_images must be an array."
    );
  }

  const ids = parsed.map((id) => {
    const number = Number(id);

    if (!Number.isSafeInteger(number) || number < 1) {
      throw new Error(
        "Invalid image ID in removed_images."
      );
    }

    return number;
  });

  return [...new Set(ids)];
}

// ======================================================
// CATEGORY AND BRAND VALIDATION
// ======================================================

async function validateCategoryAndBrand(
  connection,
  categoryId,
  brandId
) {
  const [categories] = await connection.execute(
    `SELECT id
     FROM categories
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [categoryId]
  );

  if (!categories.length) {
    throw new Error(
      "The selected category does not exist or is inactive."
    );
  }

  if (brandId !== null) {
    const [brands] = await connection.execute(
      `SELECT id
       FROM brands
       WHERE id = ? AND is_active = 1
       LIMIT 1`,
      [brandId]
    );

    if (!brands.length) {
      throw new Error(
        "The selected brand does not exist or is inactive."
      );
    }
  }
}

// ======================================================
// ATTACH PRODUCT IMAGES
// ======================================================

async function attachImages(products) {
  if (!products.length) return products;

  const ids = products.map((product) => product.id);

  const placeholders = ids.map(() => "?").join(",");

  const [images] = await db.execute(
    `SELECT
       id,
       product_id,
       image_path,
       is_primary,
       created_at
     FROM product_images
     WHERE product_id IN (${placeholders})
     ORDER BY is_primary DESC, id ASC`,
    ids
  );

  const imageMap = new Map();

  for (const image of images) {
    const productId = String(image.product_id);

    if (!imageMap.has(productId)) {
      imageMap.set(productId, []);
    }

    imageMap.get(productId).push(image);
  }

  return products.map((product) => ({
    ...product,
    images: imageMap.get(String(product.id)) || [],
  }));
}

// ======================================================
// DATABASE ERROR HANDLER
// ======================================================

function handleDatabaseError(error, res) {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message:
        "That SKU or barcode is already used by another product.",
    });
  }

  console.error("Product database error:", error);

  return res.status(500).json({
    success: false,
    message:
      "A database error occurred while processing the product.",
  });
}

// ======================================================
// GET ALL PRODUCTS
// GET /api/products
// ======================================================

async function getProducts(req, res) {
  try {
    const [products] = await db.execute(
      `SELECT
         p.*,
         c.category_name,
         b.brand_name
       FROM products p
       INNER JOIN categories c
         ON c.id = p.category_id
       LEFT JOIN brands b
         ON b.id = p.brand_id
       ORDER BY p.created_at DESC, p.id DESC`
    );

    const results = await attachImages(products);

    return res.json({
      success: true,
      products: results,
    });
  } catch (error) {
    return handleDatabaseError(error, res);
  }
}

// ======================================================
// GET SINGLE PRODUCT
// GET /api/products/:id
// ======================================================

async function getProductById(req, res) {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  try {
    const [products] = await db.execute(
      `SELECT
         p.*,
         c.category_name,
         b.brand_name
       FROM products p
       INNER JOIN categories c
         ON c.id = p.category_id
       LEFT JOIN brands b
         ON b.id = p.brand_id
       WHERE p.id = ?
       LIMIT 1`,
      [id]
    );

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const [result] = await attachImages(products);

    return res.json({
      success: true,
      product: result,
    });
  } catch (error) {
    return handleDatabaseError(error, res);
  }
}

// ======================================================
// CREATE PRODUCT
// POST /api/products
// ======================================================

async function createProduct(req, res) {
  let connection;
  let transactionStarted = false;
  let databaseCommitted = false;

  const uploadedImages = [];
  const files = req.files || [];

  try {
    const product = validateProduct(req.body);

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    await validateCategoryAndBrand(
      connection,
      product.category_id,
      product.brand_id
    );

    const productId = await generateProductId(connection);

    // Insert product.
    await connection.execute(
      `INSERT INTO products (
         id,
         name,
         description,
         sku,
         barcode,
         category_id,
         brand_id,
         quantity,
         selling_price,
         discount_price,
         unit,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        product.name,
        product.description,
        product.sku,
        product.barcode,
        product.category_id,
        product.brand_id,
        product.quantity,
        product.selling_price,
        product.discount_price,
        product.unit,
        product.status,
      ]
    );

    // Upload images to Cloudinary and save URLs.
    for (let index = 0; index < files.length; index += 1) {
      const uploadedImage = await uploadProductImage(files[index]);

      uploadedImages.push(uploadedImage);

      const imageId = await generateProductImageId(connection);

      await connection.execute(
        `INSERT INTO product_images (
           id,
           product_id,
           image_path,
           is_primary
         ) VALUES (?, ?, ?, ?)`,
        [
          imageId,
          productId,
          uploadedImage.image_path,
          index === 0,
        ]
      );
    }

    await connection.commit();
    transactionStarted = false;
    databaseCommitted = true;

    // Get created product.
    const [products] = await db.execute(
      `SELECT
         p.*,
         c.category_name,
         b.brand_name
       FROM products p
       INNER JOIN categories c
         ON c.id = p.category_id
       LEFT JOIN brands b
         ON b.id = p.brand_id
       WHERE p.id = ?
       LIMIT 1`,
      [productId]
    );

    const [createdProduct] = await attachImages(products);

    return res.status(201).json({
      success: true,
      message: "Product created successfully.",
      product: createdProduct,
    });
  } catch (error) {
    if (transactionStarted && connection) {
      await connection.rollback();
      transactionStarted = false;
    }

    // Only remove Cloudinary images if DB changes
    // were not committed.
    if (!databaseCommitted) {
      await cleanupCloudinaryUploads(uploadedImages);
    }

    if (error.message && !error.code) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return handleDatabaseError(error, res);
  } finally {
    removeUploadedFiles(files);

    if (connection) {
      connection.release();
    }
  }
}

// ======================================================
// UPDATE PRODUCT
// PUT /api/products/:id
// ======================================================

async function updateProduct(req, res) {
  const id = Number(req.params.id);

  let connection;
  let transactionStarted = false;
  let databaseCommitted = false;

  let removedImagePaths = [];

  const uploadedImages = [];
  const newFiles = req.files || [];

  if (!Number.isSafeInteger(id) || id < 1) {
    removeUploadedFiles(newFiles);

    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  try {
    const product = validateProduct(req.body);

    const removedImageIds = parseRemovedImages(
      req.body.removed_images
    );

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Lock existing product.
    const [existingRows] = await connection.execute(
      `SELECT id, quantity_sold
       FROM products
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!existingRows.length) {
      throw new Error("Product not found.");
    }

    await validateCategoryAndBrand(
      connection,
      product.category_id,
      product.brand_id
    );

    // Find selected images to remove.
    if (removedImageIds.length) {
      const placeholders = removedImageIds
        .map(() => "?")
        .join(",");

      const [imagesToRemove] = await connection.execute(
        `SELECT id, image_path
         FROM product_images
         WHERE product_id = ?
           AND id IN (${placeholders})`,
        [id, ...removedImageIds]
      );

      removedImagePaths = imagesToRemove.map(
        (image) => image.image_path
      );

      await connection.execute(
        `DELETE FROM product_images
         WHERE product_id = ?
           AND id IN (${placeholders})`,
        [id, ...removedImageIds]
      );
    }

    // Update product information.
    await connection.execute(
      `UPDATE products
       SET
         name = ?,
         description = ?,
         sku = ?,
         barcode = ?,
         category_id = ?,
         brand_id = ?,
         quantity = ?,
         selling_price = ?,
         discount_price = ?,
         unit = ?,
         status = ?
       WHERE id = ?`,
      [
        product.name,
        product.description,
        product.sku,
        product.barcode,
        product.category_id,
        product.brand_id,
        product.quantity,
        product.selling_price,
        product.discount_price,
        product.unit,
        product.status,
        id,
      ]
    );

    // Upload new images to Cloudinary.
    for (const file of newFiles) {
      const uploadedImage = await uploadProductImage(file);

      uploadedImages.push(uploadedImage);

      const imageId = await generateProductImageId(connection);

      await connection.execute(
        `INSERT INTO product_images (
           id,
           product_id,
           image_path,
           is_primary
         ) VALUES (?, ?, ?, FALSE)`,
        [
          imageId,
          id,
          uploadedImage.image_path,
        ]
      );
    }

    // Ensure at least one image is primary
    // whenever the product has images.
    const [primaryRows] = await connection.execute(
      `SELECT id
       FROM product_images
       WHERE product_id = ?
         AND is_primary = 1
       LIMIT 1`,
      [id]
    );

    if (!primaryRows.length) {
      const [firstImage] = await connection.execute(
        `SELECT id
         FROM product_images
         WHERE product_id = ?
         ORDER BY id ASC
         LIMIT 1`,
        [id]
      );

      if (firstImage.length) {
        await connection.execute(
          `UPDATE product_images
           SET is_primary = 1
           WHERE id = ?`,
          [firstImage[0].id]
        );
      }
    }

    await connection.commit();
    transactionStarted = false;
    databaseCommitted = true;

    // Delete old images only after DB commit.
    for (const imagePath of removedImagePaths) {
      await deleteStoredImage(imagePath);
    }

    // Get updated product.
    const [products] = await db.execute(
      `SELECT
         p.*,
         c.category_name,
         b.brand_name
       FROM products p
       INNER JOIN categories c
         ON c.id = p.category_id
       LEFT JOIN brands b
         ON b.id = p.brand_id
       WHERE p.id = ?
       LIMIT 1`,
      [id]
    );

    const [updatedProduct] = await attachImages(products);

    return res.json({
      success: true,
      message: "Product updated successfully.",
      product: updatedProduct,
    });
  } catch (error) {
    if (transactionStarted && connection) {
      await connection.rollback();
      transactionStarted = false;
    }

    if (!databaseCommitted) {
      await cleanupCloudinaryUploads(uploadedImages);
    }

    if (error.message === "Product not found.") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message && !error.code) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return handleDatabaseError(error, res);
  } finally {
    removeUploadedFiles(newFiles);

    if (connection) {
      connection.release();
    }
  }
}

// ======================================================
// DELETE PRODUCT
// DELETE /api/products/:id
// ======================================================

async function deleteProduct(req, res) {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Lock product before deletion.
    const [products] = await connection.execute(
      `SELECT id, quantity_sold
       FROM products
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!products.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // Do not delete products that have sales.
    if (Number(products[0].quantity_sold) > 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message:
          "This product has recorded sales. Archive it instead of deleting it.",
      });
    }

    // Get image paths before deleting database records.
    const [images] = await connection.execute(
      `SELECT image_path
       FROM product_images
       WHERE product_id = ?`,
      [id]
    );

    // Delete image database records.
    await connection.execute(
      `DELETE FROM product_images
       WHERE product_id = ?`,
      [id]
    );

    // Delete product.
    await connection.execute(
      `DELETE FROM products
       WHERE id = ?`,
      [id]
    );

    await connection.commit();
    transactionStarted = false;

    // Delete Cloudinary and legacy local images
    // after the database transaction succeeds.
    for (const image of images) {
      await deleteStoredImage(image.image_path);
    }

    return res.json({
      success: true,
      message: "Product deleted successfully.",
    });
  } catch (error) {
    if (transactionStarted && connection) {
      await connection.rollback();
    }

    return handleDatabaseError(error, res);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// ======================================================
// EXPORT CONTROLLERS
// ======================================================

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
