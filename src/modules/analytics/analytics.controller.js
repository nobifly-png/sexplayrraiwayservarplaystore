const analyticsService = require('./analytics.service');
const { successResponse } = require('../../common/helpers/response.helper');

class AnalyticsController {
  async getOverview(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      const analytics = await analyticsService.getCreatorOverview(req.user.userId, { startDate, endDate });
      successResponse(res, analytics, 'Analytics retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getVideoAnalytics(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      const analytics = await analyticsService.getVideoAnalytics(
        req.user.userId,
        req.params.videoId,
        { startDate, endDate }
      );
      successResponse(res, analytics, 'Video analytics retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getTimeSeries(req, res, next) {
    try {
      const { startDate, endDate, groupBy } = req.query;
      const series = await analyticsService.getTimeSeries(req.user.userId, { startDate, endDate, groupBy });
      successResponse(res, series, 'Time series retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getLinkAnalytics(req, res, next) {
    try {
      const analytics = await analyticsService.getLinkAnalytics(req.user.userId, req.params.linkId);
      successResponse(res, analytics, 'Link analytics retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getAdminDashboard(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      const dashboard = await analyticsService.getAdminDashboard({ startDate, endDate });
      successResponse(res, dashboard, 'Admin dashboard retrieved');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AnalyticsController();
