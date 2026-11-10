const db = require("../db");
const fs = require("fs");
const path = require("path");

const uploadDirectory = path.join(
  __dirname,
  "..",
  "public",
  "images",
  "homepage"
);

const getImagePath = (filename) => `images/homepage/${filename}`;

// Safely delete only files inside the homepage upload directory.
const deleteImageFile = async (imagePath) => {
  if (!imagePath) return;

  const value = String(imagePath);
  const filename = path.basename(value);

  // Accept either the uploaded filename or the stored relative image path.
  if (
    value !== filename &&
    value !== getImagePath(filename)
  ) {
    return;
  }

  const fullPath = path.resolve(uploadDirectory, filename);
  const directoryPath = path.resolve(uploadDirectory);

  if (!fullPath.startsWith(directoryPath + path.sep)) {
    return;
  }

  try {
    await fs.promises.unlink(fullPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
};

// GET /api/homepage/banner
const getBanner = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, image_name, image_path, posted_at
       FROM homepage_posts
       WHERE image_name = 'bannerimage'
       ORDER BY id DESC
       LIMIT 1`
    );

    return res.json({
      success: true,
      banner: rows[0] || null,
    });
  } catch (error) {
    console.error("Get homepage banner error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load homepage banner.",
    });
  }
};

// POST /api/homepage/banner
const updateBanner = async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;
  let newFileSaved = false;
  let oldImagePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a banner image.",
      });
    }

    newFileSaved = true;

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.query(
      `SELECT id, image_path
       FROM homepage_posts
       WHERE image_name = 'bannerimage'
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`
    );

    const newPath = getImagePath(req.file.filename);

    if (rows.length > 0) {
      oldImagePath = rows[0].image_path;

      await connection.query(
        `UPDATE homepage_posts
         SET image_type = 'banner',
             image_path = ?,
             posted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newPath, rows[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO homepage_posts
         (image_type, image_name, image_path)
         VALUES ('banner', 'bannerimage', ?)`,
        [newPath]
      );
    }

    await connection.commit();
    committed = true;

    // Old image cleanup must not undo a successful database update.
    if (oldImagePath) {
      try {
        await deleteImageFile(oldImagePath);
      } catch (cleanupError) {
        console.error("Old banner cleanup error:", cleanupError);
      }
    }

    return res.json({
      success: true,
      message: "Homepage banner updated successfully.",
      banner: {
        image_name: "bannerimage",
        image_path: newPath,
      },
    });
  } catch (error) {
    if (connection && transactionStarted && !committed) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Banner rollback error:", rollbackError);
      }
    }

    if (newFileSaved && req.file && !committed) {
      try {
        await deleteImageFile(req.file.filename);
      } catch (cleanupError) {
        console.error("New banner cleanup error:", cleanupError);
      }
    }

    console.error("Update homepage banner error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update homepage banner.",
    });
  } finally {
    if (connection) connection.release();
  }
};

// GET /api/homepage/logo
const getLogo = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, image_name, image_path, posted_at
       FROM homepage_posts
       WHERE image_type = 'logo'
       ORDER BY id DESC
       LIMIT 1`
    );

    return res.json({
      success: true,
      logo: rows[0] || null,
    });
  } catch (error) {
    console.error("Get homepage logo error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load website logo.",
    });
  }
};

// POST /api/homepage/logo
const updateLogo = async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;
  let newFileSaved = false;
  let oldImagePath = null;

  try {
    const imageName = String(req.body.image_name || "").trim();

    if (!imageName || imageName.length > 180) {
      if (req.file) {
        await deleteImageFile(req.file.filename);
      }

      return res.status(400).json({
        success: false,
        message: "Logo name is required and must be 180 characters or fewer.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a logo image.",
      });
    }

    newFileSaved = true;

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.query(
      `SELECT id, image_path
       FROM homepage_posts
       WHERE image_type = 'logo'
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`
    );

    const newPath = getImagePath(req.file.filename);

    if (rows.length > 0) {
      oldImagePath = rows[0].image_path;

      await connection.query(
        `UPDATE homepage_posts
         SET image_name = ?,
             image_path = ?,
             posted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [imageName, newPath, rows[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO homepage_posts
         (image_type, image_name, image_path)
         VALUES ('logo', ?, ?)`,
        [imageName, newPath]
      );
    }

    await connection.commit();
    committed = true;

    if (oldImagePath) {
      try {
        await deleteImageFile(oldImagePath);
      } catch (cleanupError) {
        console.error("Old logo cleanup error:", cleanupError);
      }
    }

    return res.json({
      success: true,
      message: "Website logo updated successfully.",
      logo: {
        image_name: imageName,
        image_path: newPath,
      },
    });
  } catch (error) {
    if (connection && transactionStarted && !committed) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Logo rollback error:", rollbackError);
      }
    }

    if (newFileSaved && req.file && !committed) {
      try {
        await deleteImageFile(req.file.filename);
      } catch (cleanupError) {
        console.error("New logo cleanup error:", cleanupError);
      }
    }

    console.error("Update homepage logo error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update website logo.",
    });
  } finally {
    if (connection) connection.release();
  }
};

// GET /api/homepage/posts
const getHomepagePosts = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, image_name, image_path, posted_at
       FROM homepage_posts
       WHERE image_type = 'gallery'
         AND image_name <> 'bannerimage'
       ORDER BY posted_at DESC, id DESC`
    );

    return res.json({
      success: true,
      posts: rows,
    });
  } catch (error) {
    console.error("Get homepage posts error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load homepage images.",
    });
  }
};

// POST /api/homepage/posts
const createHomepagePost = async (req, res) => {
  try {
    const imageName = String(req.body.image_name || "").trim();

    if (!imageName) {
      if (req.file) await deleteImageFile(req.file.filename);

      return res.status(400).json({
        success: false,
        message: "Image name is required.",
      });
    }

    if (imageName.toLowerCase() === "bannerimage") {
      if (req.file) await deleteImageFile(req.file.filename);

      return res.status(400).json({
        success: false,
        message: "This name is reserved for the homepage banner.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image.",
      });
    }

    const imagePath = getImagePath(req.file.filename);

    const [result] = await db.query(
      `INSERT INTO homepage_posts
       (image_type, image_name, image_path)
       VALUES ('gallery', ?, ?)`,
      [imageName, imagePath]
    );

    return res.status(201).json({
      success: true,
      message: "Homepage image posted successfully.",
      post: {
        id: result.insertId,
        image_name: imageName,
        image_path: imagePath,
      },
    });
  } catch (error) {
    if (req.file) {
      try {
        await deleteImageFile(req.file.filename);
      } catch (cleanupError) {
        console.error("Gallery image cleanup error:", cleanupError);
      }
    }

    console.error("Create homepage post error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to post homepage image.",
    });
  }
};

// DELETE /api/homepage/posts/:id
const deleteHomepagePost = async (req, res) => {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid homepage post ID.",
      });
    }

    const [rows] = await db.query(
      `SELECT id, image_type, image_name, image_path
       FROM homepage_posts
       WHERE id = ?`,
      [postId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Homepage image not found.",
      });
    }

    if (
      rows[0].image_type === "logo" ||
      rows[0].image_type === "banner" ||
      rows[0].image_name === "bannerimage"
    ) {
      return res.status(403).json({
        success: false,
        message: "Banner and logo images cannot be deleted from the gallery.",
      });
    }

    await db.query(
      "DELETE FROM homepage_posts WHERE id = ?",
      [postId]
    );

    await deleteImageFile(rows[0].image_path);

    return res.json({
      success: true,
      message: "Homepage image permanently deleted.",
    });
  } catch (error) {
    console.error("Delete homepage post error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete homepage image.",
    });
  }
};
// GET /api/payment-methods
// Public: customers can see active payment methods.
const getPaymentMethods = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, method_name, receiver_name,
              account_number, account_type, is_active,
              created_at, updated_at
       FROM payment_methods
       WHERE is_active = TRUE
       ORDER BY method_name ASC`
    );

    return res.json({
      success: true,
      paymentMethods: rows,
    });
  } catch (error) {
    console.error("Get payment methods error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load payment methods.",
    });
  }
};

// POST /api/payment-methods
// Owner only: create a payment method.
const createPaymentMethod = async (req, res) => {
  try {
    const {
      method_name,
      receiver_name,
      account_number,
      account_type,
    } = req.body;

    const methodName = String(method_name || "").trim();
    const receiverName = String(receiver_name || "").trim();
    const accountNumber = String(account_number || "").trim();
    const accountType = String(account_type || "").trim();

    if (
      !methodName ||
      !receiverName ||
      !accountNumber ||
      !accountType
    ) {
      return res.status(400).json({
        success: false,
        message: "All payment method fields are required.",
      });
    }

    if (
      methodName.length > 100 ||
      receiverName.length > 180 ||
      accountNumber.length > 100 ||
      accountType.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more payment method fields are too long.",
      });
    }

    const [result] = await db.query(
      `INSERT INTO payment_methods
       (method_name, receiver_name, account_number, account_type)
       VALUES (?, ?, ?, ?)`,
      [
        methodName,
        receiverName,
        accountNumber,
        accountType,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Payment method created successfully.",
      paymentMethod: {
        id: result.insertId,
        method_name: methodName,
        receiver_name: receiverName,
        account_number: accountNumber,
        account_type: accountType,
        is_active: true,
      },
    });
  } catch (error) {
    console.error("Create payment method error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create payment method.",
    });
  }
};

// PUT /api/payment-methods/:id
// Owner only: update a payment method.
const updatePaymentMethod = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method ID.",
      });
    }

    const {
      method_name,
      receiver_name,
      account_number,
      account_type,
    } = req.body;

    const methodName = String(method_name || "").trim();
    const receiverName = String(receiver_name || "").trim();
    const accountNumber = String(account_number || "").trim();
    const accountType = String(account_type || "").trim();

    if (
      !methodName ||
      !receiverName ||
      !accountNumber ||
      !accountType
    ) {
      return res.status(400).json({
        success: false,
        message: "All payment method fields are required.",
      });
    }

    if (
      methodName.length > 100 ||
      receiverName.length > 180 ||
      accountNumber.length > 100 ||
      accountType.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more payment method fields are too long.",
      });
    }

    const [result] = await db.query(
      `UPDATE payment_methods
       SET method_name = ?,
           receiver_name = ?,
           account_number = ?,
           account_type = ?
       WHERE id = ?`,
      [
        methodName,
        receiverName,
        accountNumber,
        accountType,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found.",
      });
    }

    return res.json({
      success: true,
      message: "Payment method updated successfully.",
    });
  } catch (error) {
    console.error("Update payment method error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update payment method.",
    });
  }
};

// DELETE /api/payment-methods/:id
// Owner only: permanently delete a payment method.
const deletePaymentMethod = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method ID.",
      });
    }

    const [result] = await db.query(
      "DELETE FROM payment_methods WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found.",
      });
    }

    return res.json({
      success: true,
      message: "Payment method permanently deleted.",
    });
  } catch (error) {
    console.error("Delete payment method error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete payment method.",
    });
  }
};
module.exports = {
  getBanner,
  updateBanner,
  getLogo,
  updateLogo,
  getHomepagePosts,
  createHomepagePost,
  deleteHomepagePost,

  // Payment methods
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};