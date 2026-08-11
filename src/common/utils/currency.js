const { CURRENCY } = require('../constants');

/**
 * Format amount in USD with 3 decimal places for small amounts
 * @param {number} amount - Amount to format
 * @param {boolean} includeSymbol - Include $ symbol (default: true)
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, includeSymbol = true) => {
  // Use 3 decimals for amounts less than $1, otherwise 2 decimals
  const decimals = Math.abs(amount) < 1 ? 3 : 2;
  const formatted = Number(amount).toFixed(decimals);
  return includeSymbol ? `$${formatted}` : formatted;
};

/**
 * Format amount in USD without decimals
 * @param {number} amount - Amount to format
 * @param {boolean} includeSymbol - Include $ symbol (default: true)
 * @returns {string} Formatted currency string
 */
const formatCurrencyInt = (amount, includeSymbol = true) => {
  const formatted = Math.round(Number(amount));
  return includeSymbol ? `$${formatted}` : formatted.toString();
};

/**
 * Get currency symbol
 * @returns {string} Currency symbol
 */
const getCurrencySymbol = () => '$';

/**
 * Get currency code
 * @returns {string} Currency code
 */
const getCurrencyCode = () => CURRENCY;

module.exports = {
  formatCurrency,
  formatCurrencyInt,
  getCurrencySymbol,
  getCurrencyCode
};
