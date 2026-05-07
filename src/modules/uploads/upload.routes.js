const express = require('express');
const uploadController = require('./upload.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');
const { USER_ROLES } = require('../../common/enums');
const { initiateUploadSchema, completeUploadSchema } = require('./upload.validation');

const router = express.Router();

router.use(authenticate);
router.use(authorize(USER_ROLES.CREATOR_ADMIN));

router.post('/initiate', validate(initiateUploadSchema), uploadController.initiateUpload);
router.post('/complete', validate(completeUploadSchema), uploadController.completeUpload);

module.exports = router;
