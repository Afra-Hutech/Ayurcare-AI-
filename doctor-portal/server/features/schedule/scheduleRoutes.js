const express = require('express');
const { authenticateToken } = require('../auth/authMiddleware');
const {
  getSchedule,
  updateSchedule,
  toggleBlockDate,
  toggleBlockSlot,
} = require('./scheduleController');

const router = express.Router();
router.use(authenticateToken);

router.get('/', getSchedule);
router.put('/', updateSchedule);
router.post('/block-date', toggleBlockDate);
router.post('/block-slot', toggleBlockSlot);

module.exports = router;
