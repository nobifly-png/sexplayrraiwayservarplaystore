const { CURRENCY } = require('../constants');

/**
 * Format amount in Indian Rupees
 * @param {number} amount - Amount to format
 * @param {boolean} includeSymbol - Include ₹ symbol (default: true)
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, includeSymbol = true) => {
  const formatted = Number(amount).toFixed(2);
  return includeSymbol ? `₹${formatted}` : formatted;
};

/**
 * Format amount in Indian Rupees without decimals
 * @param {number} amount - Amount to format
 * @param {boolean} includeSymbol - Include ₹ symbol (default: true)
 * @returns {string} Formatted currency string
 */
const formatCurrencyInt = (amount, includeSymbol = true) => {
  const formatted = Math.round(Number(amount));
  return includeSymbol ? `₹${formatted}` : formatted.toString();
};

/**
 * Get currency symbol
 * @returns {string} Currency symbol
 */
const getCurrencySymbol = () => '₹';

/**
 * Get currency code
 * @returns {string} Currency code (INR)
 */
const getCurrencyCode = () => CURRENCY;

module.exports = {
  formatCurrency,
  formatCurrencyInt,
  getCurrencySymbol,
  getCurrencyCode
};
