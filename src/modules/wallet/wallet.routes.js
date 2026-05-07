const express = require('express');
const walletController = require('./wallet.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/role.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const { USER_ROLES } = require('../../common/enums');
const { walletTransactionsQuerySchema } = require('./wallet.validation');

const router = express.Router();

router.use(authenticate);
router.use(authorize(USER_ROLES.CREATOR_ADMIN));

router.get('/', walletController.getWallet);
router.get('/transactions', validateQuery(walletTransactionsQuerySchema), walletController.getTransactions);

module.exports = router;
