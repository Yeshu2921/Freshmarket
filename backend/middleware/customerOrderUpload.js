
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const receiptDirectory = path.join(
  __dirname,
  "..",
  "private_uploads",
  "customer",
  "payment-receipts"
);

fs.mkdirSync(receiptDirectory, { recursive: true });

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, receiptDirectory);
  },

  filename: (req, file, callback) => {
    const extensionByMimeType = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    };

    const extension = extensionByMimeType[file.mimetype];

    if (!extension) {
      return callback(new Error("Unsupported receipt image type."));
    }

    const filename =
      `${Date.now()}-${require("crypto").randomUUID()}${extension}`;

    callback(null, filename);
  },
});

const uploadReceipt = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        new Error("Receipt must be a JPG, PNG, or WEBP image.")
      );
    }

    callback(null, true);
  },
}).single("receipt");

module.exports = {
  uploadReceipt,
  receiptDirectory,
};
