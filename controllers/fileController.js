const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const File = require('../models/File');
const User = require('../models/User');
const { uploadBufferToCloudinary, deleteFromCloudinary, pipeCloudFileToResponse } = require('../utils/cloudFile');

function fileToJSON(f) {
  return {
    id: f._id,
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size,
    createdAt: f.createdAt,
    shareId: f.shareId || null,
    shareCode: f.shareCode || null,
    shareExpires: f.shareExpires,
    hasPassword: !!f.sharePassword,
    maxDownloads: f.maxDownloads,
    downloadCount: f.downloadCount
  };
}

function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function generateUniqueShareCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSixDigitCode();
    const clash = await File.findOne({ shareCode: code });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique share code — please try again');
}

// POST /api/files/upload  (multipart field name: "files", supports multiple)
exports.uploadFiles = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    const user = req.user;
    const incomingTotal = files.reduce((s, f) => s + f.size, 0);
    if (user.storageUsed + incomingTotal > user.storageLimit) {
      return res.status(400).json({ success: false, message: 'Storage limit exceeded' });
    }

    // Upload every buffer to Cloudinary first — if any fails we bail out
    // before writing anything to Mongo or touching the user's quota.
    const uploads = await Promise.all(files.map(f =>
      uploadBufferToCloudinary(f.buffer, {
        folder: `filevault/${user._id}`,
        publicId: `${Date.now()}-${nanoid(8)}`
      })
    ));

    const created = await Promise.all(files.map((f, i) => File.create({
      owner: user._id,
      originalName: f.originalname,
      cloudPublicId: uploads[i].public_id,
      cloudUrl: uploads[i].secure_url,
      cloudResourceType: uploads[i].resource_type,
      mimeType: f.mimetype || 'application/octet-stream',
      size: f.size
    })));

    user.storageUsed += incomingTotal;
    await user.save();

    res.status(201).json({ success: true, data: created.map(fileToJSON) });
  } catch (err) {
    next(err);
  }
};

// GET /api/files
exports.listFiles = async (req, res, next) => {
  try {
    const files = await File.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: files.map(fileToJSON) });
  } catch (err) {
    next(err);
  }
};

// GET /api/files/:id/download  (owner only)
exports.downloadOwnFile = async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    await pipeCloudFileToResponse(file.cloudUrl, file.originalName, file.mimeType, res);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/files/:id
exports.deleteFile = async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    await deleteFromCloudinary(file.cloudPublicId, file.cloudResourceType).catch(() => {
      // Non-fatal — the DB record is what the app relies on; an orphaned
      // Cloudinary asset can be cleaned up separately, but we still want
      // the user's own listing and quota to update.
    });

    await file.deleteOne();

    const user = await User.findById(req.user._id);
    user.storageUsed = Math.max(0, user.storageUsed - file.size);
    await user.save();

    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    next(err);
  }
};

// POST /api/files/:id/share  { expiresInHours?, password?, maxDownloads? }
exports.createShare = async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const { expiresInHours, password, maxDownloads } = req.body;

    if (!file.shareId) file.shareId = nanoid(10);
    if (!file.shareCode) file.shareCode = await generateUniqueShareCode();
    file.shareExpires = expiresInHours ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000) : null;
    file.maxDownloads = maxDownloads ? Number(maxDownloads) : null;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      file.sharePassword = await bcrypt.hash(password, salt);
    } else {
      file.sharePassword = null;
    }

    await file.save();

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${file.shareId}`;
    const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 300, margin: 1 });

    res.json({ success: true, data: { ...fileToJSON(file), shareUrl, qrDataUrl } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/files/:id/share
exports.revokeShare = async (req, res, next) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    file.shareId = undefined;
    file.shareCode = undefined;
    file.shareExpires = null;
    file.sharePassword = null;
    file.maxDownloads = null;
    await file.save();

    res.json({ success: true, message: 'Share link revoked' });
  } catch (err) {
    next(err);
  }
};
