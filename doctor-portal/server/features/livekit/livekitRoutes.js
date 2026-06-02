const express = require('express');
const { getLiveKitToken } = require('./livekitController');

const router = express.Router();

router.post('/appointments/:appointmentId/token', getLiveKitToken);

module.exports = router;
