const express = require('express');
const videoController = require('./video.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const validateParams = require('../../middlewares/validateParams.middleware');
const { USER_ROLES } = require('../../common/enums');
const { createVideoSchema, updateVideoSchema, videoListQuerySchema } = require('./video.validation');
const { idParam } = require('../../common/validation/routeParams');

const router = express.Router();

router.use(authenticate);
router.use(authorize(USER_ROLES.CREATOR_ADMIN));

router.post('/', validate(createVideoSchema), videoController.createVideo);
router.get('/', validateQuery(videoListQuerySchema), videoController.getVideos);
router.get('/:id', validateParams(idParam), videoController.getVideo);
router.patch('/:id', validateParams(idParam), validate(updateVideoSchema), videoController.updateVideo);
router.delete('/:id', validateParams(idParam), videoController.deleteVideo);

module.exports = router;
