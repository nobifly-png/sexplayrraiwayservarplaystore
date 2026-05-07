const logger = require('../config/logger');
const { env } = require('../config/env');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.id,
    name: err.name,
    code: err.code
  });

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(422).json({
      success: false,
      message: 'Invalid id'
    });
  }

  if (err.name === 'ValidationError' && err.errors) {
    const message = Object.values(err.errors).map((e) => e.message).join(', ');
    return res.status(422).json({
      success: false,
      message
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry'
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(env !== 'production' && { stack: err.stack })
  });
};

module.exports = errorHandler;
