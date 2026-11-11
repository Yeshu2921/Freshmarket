
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// =============================================
// PRIVATE MESSAGE UPLOAD DIRECTORIES
// =============================================

const messageUploadRoot = path.join(
  __dirname,
  "..",
  "private_uploads",
  "messages"
);

const uploadDirectories = {
  image: path.join(messageUploadRoot, "images"),
  audio: path.join(messageUploadRoot, "audio"),
  video: path.join(messageUploadRoot, "videos"),
};

// Create directories automatically.
Object.values(uploadDirectories).forEach((directory) => {
  fs.mkdirSync(directory, { recursive: true });
});

// =============================================
// ALLOWED FILE TYPES
// =============================================

const allowedTypes = {
  image: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/gif": [".gif"],
  },

  audio: {
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "audio/x-wav": [".wav"],
    "audio/ogg": [".ogg"],
    "audio/mp4": [".m4a", ".mp4"],
    "audio/aac": [".aac"],
    "audio/webm": [".webm"],
  },

  video: {
    "video/mp4": [".mp4"],
    "video/webm": [".webm"],
    "video/quicktime": [".mov"],
  },
};

// =============================================
// FIND FILE CATEGORY
// =============================================

function getFileCategory(file) {
  const mimeType = file.mimetype;
  const extension = path.extname(file.originalname).toLowerCase();

  for (const [category, mimeTypes] of Object.entries(allowedTypes)) {
    const allowedExtensions = mimeTypes[mimeType];

    if (allowedExtensions?.includes(extension)) {
      return category;
    }
  }

  return null;
}

// =============================================
// MULTER STORAGE
// =============================================

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const category = getFileCategory(file);

    if (!category) {
      return callback(new Error("Unsupported attachment file type."));
    }

    callback(null, uploadDirectories[category]);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const filename = `${crypto.randomUUID()}${extension}`;

    callback(null, filename);
  },
});

// =============================================
// FILE FILTER
// =============================================

function fileFilter(req, file, callback) {
  const category = getFileCategory(file);

  if (!category) {
    const error = new Error(
      "Only supported image, audio, and video files are allowed."
    );

    error.status = 400;
    return callback(error);
  }

  file.messageCategory = category;

  callback(null, true);
}

// =============================================
// UPLOAD CONFIGURATION
// =============================================

const uploadMessageAttachment = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

// =============================================
// CATEGORY-SPECIFIC SIZE VALIDATION
// =============================================

const MAX_ATTACHMENT_SIZES = {
  image: 10 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

async function validateMessageAttachmentSize(req, res, next) {
  try {
    if (!req.file) {
      return next();
    }

    const category = getFileCategory(req.file);
    const maximumSize = MAX_ATTACHMENT_SIZES[category];

    if (!maximumSize || req.file.size > maximumSize) {
      await fs.promises.unlink(req.file.path).catch(() => {});

      return res.status(413).json({
        success: false,
        message: `The ${category || "attachment"} exceeds its allowed file size.`,
      });
    }

    req.file.messageCategory = category;

    next();
  } catch (error) {
    console.error("Message upload validation error:", error.message);

    next(error);
  }
}

// =============================================
// EXPORTS
// =============================================

module.exports = {
  uploadMessageAttachment,
  validateMessageAttachmentSize,
  messageUploadRoot,
};
