const express = require('express');
const adminController = require('./admin.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const validateParams = require('../../middlewares/validateParams.middleware');
const { adminLimiter } = require('../../middlewares/rateLimit.middleware');
const { USER_ROLES } = require('../../common/enums');
const { idParam } = require('../../common/validation/routeParams');
const { adminUserListQuerySchema, auditLogQuerySchema, adminVideoListQuerySchema } = require('./admin.validation');

const router = express.Router();

router.use(adminLimiter);
router.use(authenticate);
router.use(authorize(USER_ROLES.SUPER_ADMIN));

// Users
router.get('/users', validateQuery(adminUserListQuerySchema), adminController.getUsers);
router.get('/users/:id', validateParams(idParam), adminController.getUser);
router.patch('/users/:id/block', validateParams(idParam), adminController.blockUser);
router.patch('/users/:id/unblock', validateParams(idParam), adminController.unblockUser);

// Audit logs
router.get('/audit-logs', validateQuery(auditLogQuerySchema), adminController.getAuditLogs);

// Videos
router.get('/videos', validateQuery(adminVideoListQuerySchema), adminController.getVideos);
router.delete('/videos/:id', validateParams(idParam), adminController.deleteVideo);

module.exports = router;
