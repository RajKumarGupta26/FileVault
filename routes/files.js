const express = require('express');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  uploadFiles, listFiles, downloadOwnFile, deleteFile, createShare, revokeShare
} = require('../controllers/fileController');

const router = express.Router();

router.use(protect);

router.get('/', listFiles);
router.post('/upload', upload.array('files', 10), uploadFiles);
router.get('/:id/download', downloadOwnFile);
router.delete('/:id', deleteFile);
router.post('/:id/share', createShare);
router.delete('/:id/share', revokeShare);

module.exports = router;
