const cloudinary = require('cloudinary').v2;

// The SDK auto-reads process.env.CLOUDINARY_URL if it's set (format:
// cloudinary://<api_key>:<api_secret>@<cloud_name>). If you'd rather set
// three separate vars, that works too — we configure explicitly below.
if (!process.env.CLOUDINARY_URL) {
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  } else {
    console.warn('⚠️  Cloudinary is not configured — set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) in .env. Uploads will fail until this is set.');
  }
}

module.exports = cloudinary;
