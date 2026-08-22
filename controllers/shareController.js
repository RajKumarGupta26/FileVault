const bcrypt = require('bcryptjs');
const File = require('../models/File');
const User = require('../models/User');
const { pipeCloudFileToResponse } = require('../utils/cloudFile');

async function findActiveShare(filter, withPassword = false) {
  let query = File.findOne(filter);
  if (withPassword) query = query.select('+sharePassword');
  const file = await query;
  if (!file) return { file: null, reason: 'not_found' };
  if (file.shareExpires && new Date() > file.shareExpires) return { file: null, reason: 'expired' };
  if (file.maxDownloads && file.downloadCount >= file.maxDownloads) return { file: null, reason: 'limit_reached' };
  return { file, reason: null };
}

function notFoundMessage(reason) {
  if (reason === 'expired') return 'This link has expired';
  if (reason === 'limit_reached') return 'This file has reached its download limit';
  return 'Not found or no longer available';
}

async function buildInfoPayload(file) {
  const owner = await User.findById(file.owner);
  return {
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt,
    uploadedBy: owner ? owner.name : 'Unknown',
    hasPassword: !!file.sharePassword,
    maxDownloads: file.maxDownloads,
    downloadCount: file.downloadCount,
    shareCode: file.shareCode || null
  };
}

async function serveDownload(file, req, res) {
  if (file.sharePassword) {
    const supplied = req.body.password || '';
    const ok = await bcrypt.compare(supplied, file.sharePassword);
    if (!ok) return res.status(401).json({ success: false, message: 'Incorrect password' });
  }

  file.downloadCount += 1;
  await file.save();

  await pipeCloudFileToResponse(file.cloudUrl, file.originalName, file.mimeType, res);
}

// ---------- by link (shareId) ----------

// GET /api/share/:shareId  — metadata only, no auth
exports.getSharedFileInfo = async (req, res, next) => {
  try {
    const { file, reason } = await findActiveShare({ shareId: req.params.shareId });
    if (!file) return res.status(404).json({ success: false, message: notFoundMessage(reason) });
    res.json({ success: true, data: await buildInfoPayload(file) });
  } catch (err) {
    next(err);
  }
};

// POST /api/share/:shareId/download  { password? } — no auth
exports.downloadSharedFile = async (req, res, next) => {
  try {
    const { file, reason } = await findActiveShare({ shareId: req.params.shareId }, true);
    if (!file) return res.status(404).json({ success: false, message: notFoundMessage(reason) });
    await serveDownload(file, req, res);
  } catch (err) {
    next(err);
  }
};

// ---------- by short access code ----------

// GET /api/share/code/:code  — metadata only, no auth
exports.getSharedFileInfoByCode = async (req, res, next) => {
  try {
    const code = String(req.params.code).trim();
    const { file, reason } = await findActiveShare({ shareCode: code });
    if (!file) return res.status(404).json({ success: false, message: reason ? notFoundMessage(reason) : 'No file found for that code' });
    res.json({ success: true, data: await buildInfoPayload(file) });
  } catch (err) {
    next(err);
  }
};

// POST /api/share/code/:code/download  { password? } — no auth
exports.downloadSharedFileByCode = async (req, res, next) => {
  try {
    const code = String(req.params.code).trim();
    const { file, reason } = await findActiveShare({ shareCode: code }, true);
    if (!file) return res.status(404).json({ success: false, message: reason ? notFoundMessage(reason) : 'No file found for that code' });
    await serveDownload(file, req, res);
  } catch (err) {
    next(err);
  }
};
