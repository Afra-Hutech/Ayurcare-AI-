'use strict';
const https = require('https');
const { Appointment, User, Doctor } = require('../../models');

function formatApptWhen(appt) {
  const start = appt.startTime ? new Date(appt.startTime) : null;
  if (!start || Number.isNaN(start.getTime())) return 'your scheduled time';
  return start.toLocaleString('en-IN', {
    weekday:  'short', month:  'short', day:    'numeric',
    hour:     '2-digit', minute: '2-digit',
    timeZone: process.env.DEFAULT_CALENDAR_TIMEZONE || 'Asia/Kolkata',
  });
}

function buildMeetMessage({ patientName, doctorName, whenLabel, joinUrl }) {
  const linkLine = joinUrl
    ? `Join video: ${joinUrl}\n(Also: AyurCare app → Appointments → Join Video Session)\n`
    : 'Video: Open AyurCare → Appointments → Join Video Session during your visit window.\n';
  return (
    `AyurCare / DocConnect — video consultation\n` +
    `Hello ${patientName},\n` +
    `Doctor: ${doctorName}\n` +
    `When: ${whenLabel}\n` +
    linkLine +
    `Doctor: DocConnect → Schedule or consultation when the slot starts.`
  );
}

async function sendSmtpEmail({ to, subject, text }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || user;
  if (!host || !user || !pass || !to) return { ok: false, skipped: true, reason: 'smtp_not_configured' };
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return { ok: false, skipped: true, reason: 'nodemailer_missing' }; }
  const transporter = nodemailer.createTransport({
    host, port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass },
  });
  await transporter.sendMail({ from, to, subject, text });
  return { ok: true, channel: 'email' };
}

function twilioPost(path, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return Promise.resolve({ ok: false, skipped: true, reason: 'twilio_not_configured' });
  const auth    = Buffer.from(`${sid}:${token}`).toString('base64');
  const payload = new URLSearchParams(body).toString();
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: 'api.twilio.com', path, method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          resolve(res.statusCode >= 200 && res.statusCode < 300 ? { ok: true } : { ok: false, error: data || `HTTP ${res.statusCode}` });
        });
      },
    );
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.write(payload);
    req.end();
  });
}

async function sendSms(toPhone, text) {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from || !toPhone) return { ok: false, skipped: true, reason: 'sms_not_configured' };
  const path   = `/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const result = await twilioPost(path, { To: toPhone, From: from, Body: text });
  return result.ok ? { ok: true, channel: 'sms' } : result;
}

async function sendWhatsApp(toPhone, text) {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from || !toPhone) return { ok: false, skipped: true, reason: 'whatsapp_not_configured' };
  const path = `/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const to   = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;
  const result = await twilioPost(path, { To: to, From: from, Body: text });
  return result.ok ? { ok: true, channel: 'whatsapp' } : result;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (String(phone).trim().startsWith('+')) return String(phone).trim();
  return `+${digits}`;
}

async function notifyPatientMeetLink(appointmentId) {
  const appt = await Appointment.findByPk(appointmentId, {
    include: [
      { model: User,   as: 'patient', attributes: ['name', 'email', 'phone'] },
      { model: Doctor, as: 'doctor',  attributes: ['name', 'userId'] },
    ],
  });

  if (!appt?.meetingLink) return { ok: false, reason: 'no_meet_link' };

  const patient    = appt.patient;
  const doctorName = appt.doctor?.name ? `Dr. ${appt.doctor.name}` : 'Your doctor';
  const whenLabel  = formatApptWhen(appt);
  const joinUrl    = String(appt.meetingLink || '').trim() || null;

  const text = buildMeetMessage({
    patientName: patient?.name || 'Patient',
    doctorName,
    whenLabel,
    joinUrl,
  });

  const channels = [];
  const errors   = [];

  if (patient?.email) {
    try {
      const r = await sendSmtpEmail({ to: patient.email, subject: `DocConnect: Video consultation with ${doctorName}`, text });
      if (r.ok) channels.push('email');
      else if (!r.skipped) errors.push(`email:${r.error || r.reason}`);
    } catch (e) { errors.push(`email:${e.message}`); }
  }

  const phone = normalizePhone(patient?.phone);
  if (phone) {
    try { const sms = await sendSms(phone, text); if (sms.ok) channels.push('sms'); else if (!sms.skipped) errors.push(`sms:${sms.error || sms.reason}`); } catch (e) { errors.push(`sms:${e.message}`); }
    try { const wa  = await sendWhatsApp(phone, text); if (wa.ok)  channels.push('whatsapp'); else if (!wa.skipped)  errors.push(`whatsapp:${wa.error || wa.reason}`); } catch (e) { errors.push(`whatsapp:${e.message}`); }
  }

  await Appointment.update(
    { meetNotificationSentAt: new Date(), meetNotificationChannels: channels },
    { where: { id: appt.id } },
  );

  console.log(`[notifyPatientMeetLink] appt=${appt.id} channels=${channels.join(',') || 'in-app-only'} errors=${errors.join(';') || 'none'}`);
  return { ok: true, channels, errors, inApp: true };
}

module.exports = { notifyPatientMeetLink, buildMeetMessage };
