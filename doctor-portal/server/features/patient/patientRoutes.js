const express = require('express');
const { upload } = require('../upload/uploadMiddleware');
const {
  listReports,
  hideReport,
  listAppointments,
  cancelAppointment,
  updateProfile,
  listPrescriptions,
  getPrescription,
  listMedicalRecords,
  uploadMedicalRecord,
  deleteMedicalRecord,
  downloadMedicalRecord,
  getWellnessToday,
  upsertWellnessToday,
  getWellnessHistory,
  getAyurvedicRecommendations,
} = require('./patientController');

const router = express.Router();

router.get('/reports', listReports);
router.delete('/reports/:id', hideReport);
router.get('/appointments', listAppointments);
router.delete('/appointments/:id', cancelAppointment);
router.patch('/profile', updateProfile);
router.get('/prescriptions', listPrescriptions);
router.get('/prescription/:appointmentId', getPrescription);

// Medical Vault
router.get('/medical-records', listMedicalRecords);
router.post('/medical-records/upload', upload.single('file'), uploadMedicalRecord);
router.delete('/medical-records/:id', deleteMedicalRecord);
router.get('/medical-records/:id/download', downloadMedicalRecord);

router.get('/wellness/today', getWellnessToday);
router.put('/wellness/today', upsertWellnessToday);
router.get('/wellness/history', getWellnessHistory);
router.post('/recommendations/:sessionId', getAyurvedicRecommendations);

module.exports = router;
