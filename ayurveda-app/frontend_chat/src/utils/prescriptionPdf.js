import { jsPDF } from 'jspdf'

export function downloadPrescriptionPDF({ patientName, doctorName, consultedAt, notes, medicines = [] }) {
  const doc = new jsPDF()
  const margin = 14
  let y = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(30, 65, 50)
  doc.text('AyurCare — Prescription', margin, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text(`Patient: ${patientName || 'Patient'}`, margin, y)
  y += 6
  doc.text(`Doctor: ${doctorName || 'Doctor'}`, margin, y)
  y += 6
  if (consultedAt) {
    const when = new Date(consultedAt).toLocaleString()
    doc.text(`Date: ${when}`, margin, y)
    y += 6
  }
  y += 4

  doc.setDrawColor(200, 220, 210)
  doc.line(margin, y, 196, y)
  y += 8

  if (notes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(30, 65, 50)
    doc.text('Clinical notes', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    const lines = doc.splitTextToSize(notes.trim(), 182)
    doc.text(lines, margin, y)
    y += lines.length * 5 + 6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 65, 50)
  doc.text('Medicines & recommendations', margin, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const list = Array.isArray(medicines) && medicines.length
    ? medicines
    : [{ name: '—', details: 'No medicines listed' }]

  list.forEach((med, i) => {
    if (y > 270) {
      doc.addPage()
      y = 18
    }
    const name = med.name || med.medicine || `Item ${i + 1}`
    const details = med.details || med.dosage || ''
    doc.setFont('helvetica', 'bold')
    doc.text(`${i + 1}. ${name}`, margin, y)
    y += 5
    if (details) {
      doc.setFont('helvetica', 'normal')
      const detailLines = doc.splitTextToSize(details, 175)
      doc.text(detailLines, margin + 4, y)
      y += detailLines.length * 5
    }
    y += 4
  })

  y += 6
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text(
    'This prescription was issued after your AyurCare consultation. Follow your practitioner’s guidance.',
    margin,
    Math.min(y + 4, 285),
    { maxWidth: 182 },
  )

  const safeName = (patientName || 'patient').replace(/[^\w-]+/g, '_').slice(0, 24)
  doc.save(`AyurCare_Prescription_${safeName}.pdf`)
}
