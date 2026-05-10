const express = require('express');
const cookieParser = require('cookie-parser');
const { trustProxy } = require('./config/env');
const securityMiddleware = require('./middlewares/security.middleware');
const requestId = require('./middlewares/requestId.middleware');
const errorHandler = require('./middlewares/error.middleware');
const routes = require('./routes');
const watchRoutes = require('./routes/watch');
const accessLog = require('./middlewares/accessLog.middleware');

const app = express();
app.set('trust proxy', trustProxy);

app.use(securityMiddleware);
app.use(requestId);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use('/api', accessLog);
app.use('/api', routes);
app.use('/', watchRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use(errorHandler);

module.exports = app;
