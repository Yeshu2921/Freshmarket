const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.join(
  __dirname,
  "..",
  "uploads",
  "products"
);

fs.mkdirSync(uploadDirectory, { recursive: true });

// Supported image extensions
const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".png",
  ".webp",
]);

// Supported image MIME types
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !allowedExtensions.has(extension) ||
    !allowedMimeTypes.has(file.mimetype)
  ) {
    return callback(
      new Error(
        "Only JPG, JPEG, JFIF, PNG, and WEBP images are allowed."
      )
    );
  }

  callback(null, true);
};

const uploadProductImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
});

module.exports = uploadProductImages;