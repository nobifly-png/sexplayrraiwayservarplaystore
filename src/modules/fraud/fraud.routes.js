const express = require('express');
const fraudController = require('./fraud.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const validateParams = require('../../middlewares/validateParams.middleware');
const { adminLimiter } = require('../../middlewares/rateLimit.middleware');
const { USER_ROLES } = require('../../common/enums');
const { idParam } = require('../../common/validation/routeParams');
const { fraudFlagsListQuerySchema } = require('./fraud.validation');

const router = express.Router();

router.use(adminLimiter);
router.use(authenticate);
router.use(authorize(USER_ROLES.SUPER_ADMIN));

router.get('/flags', validateQuery(fraudFlagsListQuerySchema), fraudController.getFraudFlags);
router.get('/sessions/:id', validateParams(idParam), fraudController.getSessionDetails);
router.patch('/flags/:id/resolve', validateParams(idParam), fraudController.resolveFlag);

module.exports = router;
