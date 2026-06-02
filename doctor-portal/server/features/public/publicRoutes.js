const express = require('express');
const {
  getNearbyDoctors,
  getDoctorAvailability,
  bookAppointment,
} = require('./publicController');
const { getDoctorSlots } = require('../schedule/scheduleController');

const router = express.Router();

router.get('/doctors/nearby', getNearbyDoctors);
router.get('/doctors/:id/availability', getDoctorAvailability);
router.get('/doctors/:id/slots', getDoctorSlots);
router.post('/appointments/book', bookAppointment);

module.exports = router;
