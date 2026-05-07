const pino = require('pino');
const { env, logLevel } = require('./env');

const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'secret',
      '*.secret',
      '*.password',
      '*.passwordHash',
      'refreshToken',
      'accessToken',
      'body.password',
      'body.refreshToken',
      'body.currentPassword',
      'body.newPassword',
      'body.secret'
    ],
    remove: true
  },
  transport: env !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

module.exports = logger;
