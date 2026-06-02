const express = require('express');
const { upload } = require('../upload/uploadMiddleware');
const {
  updateAppointment,
  updateAppointmentStatus,
  uploadAttachments,
} = require('./appointmentController');

const router = express.Router();

router.patch('/:id', updateAppointment);
router.patch('/:id/status', updateAppointmentStatus);
router.post('/:id/attachments', upload.array('files', 10), uploadAttachments);

module.exports = router;
