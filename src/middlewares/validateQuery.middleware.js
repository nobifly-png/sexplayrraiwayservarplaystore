const { ValidationError } = require('../common/errors');

/**
 * Validates req.query with Joi (coercion on for numeric query params).
 * Replaces req.query with validated values (defaults applied).
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const message = error.details.map((d) => d.message).join(', ');
      return next(new ValidationError(message));
    }

    req.query = value;
    next();
  };
};

module.exports = validateQuery;
