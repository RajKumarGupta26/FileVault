const multer = require('multer');

// Files are now buffered in memory and streamed straight to Cloudinary
// (see controllers/fileController.js) — nothing touches local disk, so
// this works fine on hosts with ephemeral/read-only filesystems too.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 262144000 } // 250MB default
});

module.exports = { upload };
