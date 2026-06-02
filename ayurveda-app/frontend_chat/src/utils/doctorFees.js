/** Consultation fee from doctor profile (availability.fees). */
export function getDoctorConsultationFee(doctor) {
  const fee = Number(doctor?.availability?.fees);
  return Number.isFinite(fee) && fee >= 0 ? fee : null;
}

export function formatDoctorFee(doctor, { fallback = null } = {}) {
  const fee = getDoctorConsultationFee(doctor);
  if (fee == null) return fallback;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(fee);
}
