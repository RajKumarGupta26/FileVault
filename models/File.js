const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  originalName: { type: String, required: true },
  cloudPublicId: { type: String, required: true }, // Cloudinary asset id, needed to delete/fetch
  cloudUrl: { type: String, required: true },       // Cloudinary secure delivery URL
  cloudResourceType: { type: String, default: 'raw' }, // image | video | raw — Cloudinary's classification
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },

  shareId: { type: String, unique: true, sparse: true, index: true },
  shareCode: { type: String, unique: true, sparse: true, index: true }, // short human-typeable code, e.g. "482913"
  shareExpires: { type: Date, default: null },
  sharePassword: { type: String, default: null, select: false },
  maxDownloads: { type: Number, default: null },
  downloadCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('File', fileSchema);
