const express = require('express');
const router  = express.Router();
const { createOrder, verifyPayment, getPaymentForAppointment, initiateRefund } = require('./paymentController');

// POST /api/payments/create-order
router.post('/create-order', createOrder);

// POST /api/payments/verify
router.post('/verify', verifyPayment);

// GET /api/payments/appointment/:id
router.get('/appointment/:id', getPaymentForAppointment);

// POST /api/payments/refund/:appointmentId
router.post('/refund/:appointmentId', initiateRefund);

module.exports = router;
