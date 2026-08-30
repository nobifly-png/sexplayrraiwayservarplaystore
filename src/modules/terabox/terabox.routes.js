const express = require('express');
const router = express.Router();
const teraboxController = require('./terabox.controller');
const authenticate = require('../../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

// POST /api/terabox/convert  — convert a TeraBox link to Zaxgram link
router.post('/convert', teraboxController.convert);

// GET /api/terabox/quota  — check daily quota status
router.get('/quota', teraboxController.quota);

module.exports = router;
