
const db = require("../db");
const fs = require("fs");
const path = require("path");

// =====================================================
// HOMEPAGE IMAGE DIRECTORY
// =====================================================

const uploadDirectory = path.join(
  __dirname,
  "..",
  "public",
  "images",
  "homepage"
);

const getImagePath = (filename) =>
  `images/homepage/${filename}`;

// =====================================================
// SHARED ID GENERATOR
// =====================================================

const generateNextId = async (connection) => {
  const [result] = await connection.query(
    "INSERT INTO user_id_generator () VALUES ()"
  );

  return Number(result.insertId);
};

// =====================================================
// SAFE IMAGE FILE DELETION
// =====================================================

const deleteImageFile = async (imagePath) => {
  if (!imagePath) return;

  const value = String(imagePath);
  const filename = path.basename(value);

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

// =====================================================
// GET HOMEPAGE BANNER
// GET /api/homepage/banner
// =====================================================

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

// =====================================================
// UPDATE HOMEPAGE BANNER
// POST /api/homepage/banner
// =====================================================

const updateBanner = async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;
  let oldImagePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a banner image.",
      });
    }

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
      const bannerId = await generateNextId(connection);

      await connection.query(
        `INSERT INTO homepage_posts
         (id, image_type, image_name, image_path)
         VALUES (?, 'banner', 'bannerimage', ?)`,
        [bannerId, newPath]
      );
    }

    await connection.commit();
    committed = true;

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

    if (req.file && !committed) {
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

// =====================================================
// GET WEBSITE LOGO
// GET /api/homepage/logo
// =====================================================

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

// =====================================================
// UPDATE WEBSITE LOGO
// POST /api/homepage/logo
// =====================================================

const updateLogo = async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;
  let oldImagePath = null;

  try {
    const imageName = String(req.body.image_name || "").trim();

    if (!imageName || imageName.length > 180) {
      if (req.file) {
        await deleteImageFile(req.file.filename);
      }

      return res.status(400).json({
        success: false,
        message:
          "Logo name is required and must be 180 characters or fewer.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a logo image.",
      });
    }

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
      const logoId = await generateNextId(connection);

      await connection.query(
        `INSERT INTO homepage_posts
         (id, image_type, image_name, image_path)
         VALUES (?, 'logo', ?, ?)`,
        [logoId, imageName, newPath]
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

    if (req.file && !committed) {
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

// =====================================================
// GET HOMEPAGE GALLERY POSTS
// GET /api/homepage/posts
// =====================================================

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

// =====================================================
// CREATE HOMEPAGE GALLERY POST
// POST /api/homepage/posts
// =====================================================

const createHomepagePost = async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;

  try {
    const imageName = String(req.body.image_name || "").trim();

    if (!imageName) {
      if (req.file) {
        await deleteImageFile(req.file.filename);
      }

      return res.status(400).json({
        success: false,
        message: "Image name is required.",
      });
    }

    if (imageName.length > 180) {
      if (req.file) {
        await deleteImageFile(req.file.filename);
      }

      return res.status(400).json({
        success: false,
        message: "Image name must not exceed 180 characters.",
      });
    }

    if (imageName.toLowerCase() === "bannerimage") {
      if (req.file) {
        await deleteImageFile(req.file.filename);
      }

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

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const postId = await generateNextId(connection);

    await connection.query(
      `INSERT INTO homepage_posts
       (id, image_type, image_name, image_path)
       VALUES (?, 'gallery', ?, ?)`,
      [postId, imageName, imagePath]
    );

    await connection.commit();
    committed = true;

    return res.status(201).json({
      success: true,
      message: "Homepage image posted successfully.",
      post: {
        id: postId,
        image_name: imageName,
        image_path: imagePath,
        posted_at: new Date(),
      },
    });
  } catch (error) {
    if (connection && transactionStarted && !committed) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Gallery rollback error:", rollbackError);
      }
    }

    if (req.file && !committed) {
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
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// DELETE HOMEPAGE GALLERY POST
// DELETE /api/homepage/posts/:id
// =====================================================

const deleteHomepagePost = async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;

  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid homepage post ID.",
      });
    }

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.query(
      `SELECT id, image_type, image_name, image_path
       FROM homepage_posts
       WHERE id = ?
       FOR UPDATE`,
      [postId]
    );

    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Homepage image not found.",
      });
    }

    const post = rows[0];

    if (
      post.image_type === "logo" ||
      post.image_type === "banner" ||
      post.image_name === "bannerimage"
    ) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(403).json({
        success: false,
        message:
          "Banner and logo images cannot be deleted from the gallery.",
      });
    }

    await connection.query(
      "DELETE FROM homepage_posts WHERE id = ?",
      [postId]
    );

    await connection.commit();
    committed = true;

    try {
      await deleteImageFile(post.image_path);
    } catch (cleanupError) {
      console.error("Gallery image file cleanup error:", cleanupError);
    }

    return res.json({
      success: true,
      message: "Homepage image permanently deleted.",
    });
  } catch (error) {
    if (connection && transactionStarted && !committed) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Delete gallery rollback error:", rollbackError);
      }
    }

    console.error("Delete homepage post error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete homepage image.",
    });
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// GET PAYMENT METHODS
// GET /api/payment-methods
// =====================================================

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

// =====================================================
// CREATE PAYMENT METHOD
// POST /api/payment-methods
// =====================================================

const createPaymentMethod = async (req, res) => {
  let connection;
  let transactionStarted = false;
  let committed = false;

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

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const paymentMethodId = await generateNextId(connection);

    await connection.query(
      `INSERT INTO payment_methods
       (
         id,
         method_name,
         receiver_name,
         account_number,
         account_type
       )
       VALUES (?, ?, ?, ?, ?)`,
      [
        paymentMethodId,
        methodName,
        receiverName,
        accountNumber,
        accountType,
      ]
    );

    await connection.commit();
    committed = true;

    return res.status(201).json({
      success: true,
      message: "Payment method created successfully.",
      paymentMethod: {
        id: paymentMethodId,
        method_name: methodName,
        receiver_name: receiverName,
        account_number: accountNumber,
        account_type: accountType,
        is_active: 1,
      },
    });
  } catch (error) {
    if (connection && transactionStarted && !committed) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Payment method rollback error:",
          rollbackError
        );
      }
    }

    console.error("Create payment method error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create payment method.",
    });
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// UPDATE PAYMENT METHOD
// PUT /api/payment-methods/:id
// =====================================================

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

// =====================================================
// DELETE PAYMENT METHOD
// DELETE /api/payment-methods/:id
// =====================================================

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

// =====================================================
// EXPORT ALL CONTROLLERS
// =====================================================

module.exports = {
  getBanner,
  updateBanner,

  getLogo,
  updateLogo,

  getHomepagePosts,
  createHomepagePost,
  deleteHomepagePost,

  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
