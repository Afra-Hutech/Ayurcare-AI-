const express = require('express');
const { authenticateToken } = require('../auth/authMiddleware');
const {
  getProfile,
  updateProfile,
  toggleLeave,
  onboarding,
  listAppointments,
  getAppointment,
  startConsultation,
  endConsultation,
  getPrescription,
  draftPrescription,
  finalizePrescription,
  getPatientWellnessHistory,
  getRevenueSummary,
} = require('./doctorController');

const router = express.Router();
router.use(authenticateToken);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.patch('/leave-toggle', toggleLeave);
router.post('/onboarding', onboarding);
router.get('/appointments', listAppointments);
router.get('/revenue-summary', getRevenueSummary);
router.get('/appointments/:id', getAppointment);
router.post('/consultation/start', startConsultation);
router.post('/consultation/end', endConsultation);
router.get('/prescription/:appointmentId', getPrescription);
router.post('/prescription/draft', draftPrescription);
router.post('/prescription/finalize', finalizePrescription);
router.get('/patients/:patientId/wellness/history', getPatientWellnessHistory);

module.exports = router;
