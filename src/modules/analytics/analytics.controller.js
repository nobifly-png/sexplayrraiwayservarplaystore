const analyticsService = require('./analytics.service');
const { successResponse } = require('../../common/helpers/response.helper');
const { formatCurrency } = require('../../common/utils');

class AnalyticsController {
  async getOverview(req, res, next) {
    try {
      // Overview reads from the 12-hour snapshot — date filters not applicable here.
      const analytics = await analyticsService.getCreatorOverview(req.user.userId);

      const formattedAnalytics = {
        ...analytics,
        totalEarningsFormatted: formatCurrency(analytics.totalEarnings)
      };

      successResponse(res, formattedAnalytics, 'Analytics retrieved');
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
      
      if (analytics) {
        // Format currency for display
        analytics.totalEarningsFormatted = formatCurrency(analytics.totalEarnings);
      }
      
      successResponse(res, analytics, 'Video analytics retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getTimeSeries(req, res, next) {
    try {
      const { startDate, endDate, groupBy } = req.query;
      const series = await analyticsService.getTimeSeries(req.user.userId, { startDate, endDate, groupBy });
      
      // Format earnings in each series entry
      const formattedSeries = series.map(entry => ({
        ...entry,
        earningsFormatted: formatCurrency(entry.earnings || 0)
      }));
      
      successResponse(res, formattedSeries, 'Time series retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getLinkAnalytics(req, res, next) {
    try {
      const analytics = await analyticsService.getLinkAnalytics(req.user.userId, req.params.linkId);
      
      // Format currency for display
      analytics.totalEarningsFormatted = formatCurrency(analytics.totalEarnings);
      
      successResponse(res, analytics, 'Link analytics retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getAdminDashboard(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      const dashboard = await analyticsService.getAdminDashboard({ startDate, endDate });
      
      // Format currency for display
      dashboard.totalEarningsFormatted = formatCurrency(dashboard.totalEarnings);
      
      // Format top creators earnings
      if (dashboard.topCreators) {
        dashboard.topCreators = dashboard.topCreators.map(creator => ({
          ...creator,
          earningsFormatted: formatCurrency(creator.earnings)
        }));
      }
      
      successResponse(res, dashboard, 'Admin dashboard retrieved');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AnalyticsController();
