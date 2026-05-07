const express = require('express');
const linkController = require('./link.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');
const validateParams = require('../../middlewares/validateParams.middleware');
const { USER_ROLES } = require('../../common/enums');
const { createLinkSchema } = require('./link.validation');
const { idParam, videoIdParam } = require('../../common/validation/routeParams');

const router = express.Router();

router.post('/', authenticate, authorize(USER_ROLES.CREATOR_ADMIN), validate(createLinkSchema), linkController.createLink);
router.get('/video/:videoId', authenticate, authorize(USER_ROLES.CREATOR_ADMIN), validateParams(videoIdParam), linkController.getVideoLinks);
router.patch('/:id/toggle', authenticate, authorize(USER_ROLES.CREATOR_ADMIN), validateParams(idParam), linkController.toggleLink);

module.exports = router;
