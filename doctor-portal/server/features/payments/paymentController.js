'use strict';
const Stripe      = require('stripe');
const { Appointment, Payment, Doctor } = require('../../models');
const { getDoctorListingFee }          = require('../common/revenueHelpers');

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured in .env');
  return Stripe(key);
};

/* ── 1. Create Stripe PaymentIntent ──────────────────────────────────── */
const createOrder = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json({ message: 'appointmentId required' });

    const appt = await Appointment.findByPk(appointmentId, {
      include: [{ model: Doctor, as: 'doctor' }],
    });
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.patientId !== req.userId)
      return res.status(403).json({ message: 'Not your appointment' });

    const existing = await Payment.findOne({ where: { appointmentId, status: 'paid' } });
    if (existing) return res.status(400).json({ message: 'Appointment already paid', payment: existing });

    let amount = Number(appt.fee) || 0;
    if (!amount) {
      amount = getDoctorListingFee(appt.doctor) || 500;
    }

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount:   Math.round(amount * 100),
      currency: 'inr',
      metadata: { appointmentId: String(appointmentId), patientId: String(req.userId) },
    });

    await Payment.upsert({
      appointmentId,
      patientId:            req.userId,
      doctorId:             appt.doctorId,
      amount,
      stripePaymentIntentId: intent.id,
      status:               'pending',
    });

    return res.json({
      clientSecret:   intent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      amount,
      currency:       'INR',
    });
  } catch (err) {
    console.error('[Payment] createOrder error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

/* ── 2. Verify payment via Stripe API ────────────────────────────────── */
const verifyPayment = async (req, res) => {
  try {
    const { paymentIntentId, appointmentId } = req.body;
    if (!paymentIntentId || !appointmentId)
      return res.status(400).json({ message: 'paymentIntentId and appointmentId required' });

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded')
      return res.json({ success: false, message: `Payment not completed (status: ${intent.status})` });

    await Payment.update(
      { stripePaymentIntentId: paymentIntentId, status: 'paid' },
      { where: { appointmentId } },
    );
    const payment = await Payment.findOne({ where: { appointmentId } });

    if (payment) {
      await Appointment.update(
        { paymentStatus: 'paid', fee: payment.amount },
        { where: { id: appointmentId } },
      );
    }
    return res.json({ success: true, payment });
  } catch (err) {
    console.error('[Payment] verifyPayment error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

/* ── 3. Get payment status for an appointment ────────────────────────── */
const getPaymentForAppointment = async (req, res) => {
  try {
    const appt = await Appointment.findByPk(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.patientId !== req.userId && appt.doctorId !== req.userId)
      return res.status(403).json({ message: 'Forbidden' });

    const payment = await Payment.findOne({
      where: { appointmentId: req.params.id },
      order: [['created_at', 'DESC']],
    });
    return res.json(payment || { status: 'unpaid' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── 4. Process refund (internal) ──────────────────────────────────── */
const processRefund = async (appointmentId, reason = 'Doctor cancelled the consultation') => {
  const payment = await Payment.findOne({ where: { appointmentId, status: 'paid' } });
  if (!payment) return null;

  try {
    const stripe  = getStripe();
    const intent  = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    const chargeId = intent.latest_charge;
    if (!chargeId) throw new Error('No charge found for payment intent');

    const refund = await stripe.refunds.create({ charge: chargeId, reason: 'requested_by_customer' });

    await payment.update({
      status:       'refunded',
      refundId:     refund.id,
      refundAmount: payment.amount,
      refundReason: reason,
      refundedAt:   new Date(),
    });
    await Appointment.update({ paymentStatus: 'refunded' }, { where: { id: appointmentId } });
    console.log(`[Payment] Refund completed for appointment ${appointmentId}: ${refund.id}`);
    return refund;
  } catch (err) {
    await payment.update({ status: 'refund_pending', refundReason: reason });
    await Appointment.update({ paymentStatus: 'refund_pending' }, { where: { id: appointmentId } });
    console.error('[Payment] Refund failed, marked pending:', err.message);
    return null;
  }
};

/* ── 5. Manual refund endpoint ─────────────────────────────────────── */
const initiateRefund = async (req, res) => {
  try {
    const refund = await processRefund(req.params.appointmentId, req.body.reason || 'Manual refund');
    if (!refund) return res.status(404).json({ message: 'No paid payment found for this appointment' });
    return res.json({ success: true, refundId: refund.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createOrder, verifyPayment, getPaymentForAppointment, initiateRefund, processRefund };
