const express = require('express');
const analyticsController = require('./analytics.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validateParams = require('../../middlewares/validateParams.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const { adminLimiter } = require('../../middlewares/rateLimit.middleware');
const { USER_ROLES } = require('../../common/enums');
const { videoIdParam, objectIdSchema } = require('../../common/validation/routeParams');
const Joi = require('joi');

const dateRangeQuery = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  groupBy: Joi.string().valid('day', 'month').default('day')
});

const linkIdParam = Joi.object({ linkId: objectIdSchema.required() });

const router = express.Router();

router.get('/overview', authenticate, authorize(USER_ROLES.CREATOR_ADMIN), validateQuery(dateRangeQuery), analyticsController.getOverview);
router.get('/timeseries', authenticate, authorize(USER_ROLES.CREATOR_ADMIN), validateQuery(dateRangeQuery), analyticsController.getTimeSeries);
router.get('/videos/:videoId', authenticate, authorize(USER_ROLES.CREATOR_ADMIN), validateParams(videoIdParam), validateQuery(dateRangeQuery), analyticsController.getVideoAnalytics);
router.get('/links/:linkId', authenticate, authorize(USER_ROLES.CREATOR_ADMIN), validateParams(linkIdParam), analyticsController.getLinkAnalytics);
router.get('/admin/dashboard', adminLimiter, authenticate, authorize(USER_ROLES.SUPER_ADMIN), validateQuery(dateRangeQuery), analyticsController.getAdminDashboard);

module.exports = router;
