const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getSharedFileInfo, downloadSharedFile,
  getSharedFileInfoByCode, downloadSharedFileByCode
} = require('../controllers/shareController');

const router = express.Router();

// A 6-digit code has only ~900k combinations — rate-limit lookups so it
// can't be brute-forced from a script, while staying generous for a human
// mistyping a digit a few times.
const codeLookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many attempts — please wait a few minutes and try again' }
});

// Code-based access (short, human-typeable)
router.get('/code/:code', codeLookupLimiter, getSharedFileInfoByCode);
router.post('/code/:code/download', codeLookupLimiter, downloadSharedFileByCode);

// Link-based access (shareId from the link/QR)
router.get('/:shareId', getSharedFileInfo);
router.post('/:shareId/download', downloadSharedFile);

module.exports = router;
