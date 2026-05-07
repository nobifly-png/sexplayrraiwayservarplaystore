const express = require('express');
const playbackController = require('./playback.controller');
const validate = require('../../middlewares/validate.middleware');
const { playbackLimiter } = require('../../middlewares/rateLimit.middleware');
const { createSessionSchema, createEventSchema, finalizeSessionSchema } = require('./playback.validation');

const router = express.Router();

router.post('/session', playbackLimiter, validate(createSessionSchema), playbackController.createSession);
router.post('/event', playbackLimiter, validate(createEventSchema), playbackController.createEvent);
router.post('/finalize', playbackLimiter, validate(finalizeSessionSchema), playbackController.finalizeSession);

module.exports = router;
