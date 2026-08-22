const https = require('https');
const cloudinary = require('../config/cloudinary');

// Uploads a multer memory-buffer to Cloudinary. resource_type: 'auto' lets
// Cloudinary decide image/video/raw based on content — fine for a generic
// file vault where users upload anything from PDFs to zips to photos.
function uploadBufferToCloudinary(buffer, { folder, publicId }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'auto', use_filename: false, unique_filename: false },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

function deleteFromCloudinary(publicId, resourceType) {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType || 'raw' });
}

// Streams a Cloudinary-hosted file down to the client, forcing the
// original filename via Content-Disposition (Cloudinary's own stored
// filename is a random public_id, not what the user uploaded).
function pipeCloudFileToResponse(cloudUrl, originalName, mimeType, res) {
  return new Promise((resolve, reject) => {
    https.get(cloudUrl, (cloudRes) => {
      if (cloudRes.statusCode !== 200) {
        cloudRes.resume(); // drain so the socket can be released
        reject(new Error('File missing from cloud storage'));
        return;
      }
      const safeName = originalName.replace(/"/g, '');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
      );
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      cloudRes.pipe(res);
      cloudRes.on('end', resolve);
      cloudRes.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { uploadBufferToCloudinary, deleteFromCloudinary, pipeCloudFileToResponse };
