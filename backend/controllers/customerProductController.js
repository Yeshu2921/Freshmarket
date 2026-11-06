
const db = require("../db");

async function attachImages(products) {
  if (!products.length) return products;

  const ids = products.map((product) => product.id);
  const placeholders = ids.map(() => "?").join(",");

  const [images] = await db.execute(
    `SELECT id, product_id, image_path, is_primary, created_at
     FROM product_images
     WHERE product_id IN (${placeholders})
     ORDER BY is_primary DESC, id ASC`,
    ids
  );

  const imageMap = new Map();

  for (const image of images) {
    if (!imageMap.has(String(image.product_id))) {
      imageMap.set(String(image.product_id), []);
    }

    imageMap.get(String(image.product_id)).push(image);
  }

  return products.map((product) => ({
    ...product,
    images: imageMap.get(String(product.id)) || [],
  }));
}

// GET /api/customer-products
async function getPublicProducts(req, res) {
  try {
    const [products] = await db.execute(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.sku,
         p.barcode,
         p.category_id,
         p.brand_id,
         p.quantity,
         p.selling_price,
         p.discount_price,
         p.unit,
         p.status,
         p.created_at,
         c.category_name,
         b.brand_name
       FROM products p
       INNER JOIN categories c
         ON c.id = p.category_id
       LEFT JOIN brands b
         ON b.id = p.brand_id
       WHERE LOWER(TRIM(p.status)) = 'active'
         AND c.is_active = 1
       ORDER BY p.created_at DESC, p.id DESC`
    );

    const results = await attachImages(products);

    return res.json({
      success: true,
      products: results,
    });
  } catch (error) {
    console.error("Public product list database error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load public products.",
    });
  }
}

// GET /api/customer-products/:id
async function getPublicProductById(req, res) {
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
         p.id,
         p.name,
         p.description,
         p.sku,
         p.barcode,
         p.category_id,
         p.brand_id,
         p.quantity,
         p.selling_price,
         p.discount_price,
         p.unit,
         p.status,
         p.created_at,
         c.category_name,
         b.brand_name
       FROM products p
       INNER JOIN categories c
         ON c.id = p.category_id
       LEFT JOIN brands b
         ON b.id = p.brand_id
       WHERE p.id = ?
         AND LOWER(TRIM(p.status)) = 'active'
         AND c.is_active = 1
       LIMIT 1`,
      [id]
    );

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found or not available.",
      });
    }

    const [product] = await attachImages(products);

    return res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Public product detail database error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load this product.",
    });
  }
}

module.exports = {
  getPublicProducts,
  getPublicProductById,
};
