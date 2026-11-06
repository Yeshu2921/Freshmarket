
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

const getImagePath = (filename) =>
  `images/homepage/${filename}`;

const deleteImageFile = async (imagePath) => {
  if (!imagePath) return;

  const filename = path.basename(imagePath);

  // Only delete files from the homepage upload directory.
  if (filename !== imagePath.replace(/^.*[\\/]/, "")) return;

  const fullPath = path.join(uploadDirectory, filename);

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
  let newFileSaved = false;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a banner image.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, image_path
       FROM homepage_posts
       WHERE image_name = 'bannerimage'
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`
    );

    const newPath = getImagePath(req.file.filename);
    newFileSaved = true;

    if (rows.length > 0) {
      await connection.query(
        `UPDATE homepage_posts
         SET image_path = ?, posted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newPath, rows[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO homepage_posts (image_name, image_path)
         VALUES ('bannerimage', ?)`,
        [newPath]
      );
    }

    await connection.commit();

    // Delete previous banner only after the database update succeeds.
    if (rows.length > 0) {
      await deleteImageFile(rows[0].image_path);
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
    if (connection) await connection.rollback();

    if (newFileSaved && req.file) {
      await deleteImageFile(req.file.filename);
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

// GET /api/homepage/posts
const getHomepagePosts = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, image_name, image_path, posted_at
       FROM homepage_posts
       WHERE image_name <> 'bannerimage'
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
      `INSERT INTO homepage_posts (image_name, image_path)
       VALUES (?, ?)`,
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
      await deleteImageFile(req.file.filename);
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
      `SELECT id, image_name, image_path
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

    if (rows[0].image_name === "bannerimage") {
      return res.status(403).json({
        success: false,
        message: "Use Change Banner to replace the homepage banner.",
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

module.exports = {
  getBanner,
  updateBanner,
  getHomepagePosts,
  createHomepagePost,
  deleteHomepagePost,
};
