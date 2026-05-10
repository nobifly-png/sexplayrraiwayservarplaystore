const express = require('express');
const multer = require('multer');
const uploadController = require('./upload.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');
const { USER_ROLES } = require('../../common/enums');
const { initiateUploadSchema, completeUploadSchema } = require('./upload.validation');
const { MAX_THUMB_BYTES, ALLOWED_THUMB_MIMES } = require('./thumbnail.service');

const storage = multer.memoryStorage();
const thumbnailUpload = multer({
  storage,
  limits: { fileSize: MAX_THUMB_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_THUMB_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only jpg, png, webp allowed'));
  }
});

const router = express.Router();

router.use(authenticate);
router.use(authorize(USER_ROLES.CREATOR_ADMIN));

router.post('/initiate', validate(initiateUploadSchema), uploadController.initiateUpload);
router.post('/complete', validate(completeUploadSchema), uploadController.completeUpload);
router.post('/thumbnail', thumbnailUpload.single('thumbnail'), uploadController.uploadThumbnail);

module.exports = router;
