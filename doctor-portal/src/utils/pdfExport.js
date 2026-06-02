import { jsPDF } from 'jspdf'
import { sanitizeMarkdownText } from './textUtils'

export function downloadMedicalReportPDF(report, options = {}) {
  if (!report) return

  try {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth() // 210 for A4
    const pageHeight = doc.internal.pageSize.getHeight() // 297 for A4

    // Ayurvedic Green Theme Colors (Rich Forest Green & Soft Sage)
    const HEADER_BLUE = [44, 70, 61]
    const LABEL_BLUE = [225, 236, 230]

    const isEmpty = (val) => {
      if (!val) return true;
      if (Array.isArray(val)) return val.length === 0;
      if (typeof val === 'string') return val.trim() === '' || val.trim().toLowerCase() === 'not provided' || val.trim().toLowerCase() === 'n/a' || val.trim().toLowerCase() === 'n.a.';
      return false;
    };

    // Helper to draw a standard cell in the grid
    const drawCell = (x, y, w, h, text, isLabel = false, align = 'justify') => {
      doc.setDrawColor(50, 50, 50);
      doc.setLineWidth(0.2);
      if (isLabel) {
        doc.setFillColor(LABEL_BLUE[0], LABEL_BLUE[1], LABEL_BLUE[2]);
        doc.rect(x, y, w, h, 'FD');
        doc.setFont('times', 'bold');
        align = 'left'; // Labels are usually better left aligned
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, w, h, 'FD');
        doc.setFont('times', 'normal');
      }
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);

      if (text) {
        const options = { maxWidth: w - 4, lineHeightFactor: 1.5 };
        if (align === 'center') {
          options.align = 'center';
          doc.text(String(text), x + w / 2, y + 6, options);
        } else if (align === 'justify' && !isLabel) {
          options.align = 'justify';
          doc.text(String(text), x + 2, y + 6, options);
        } else {
          doc.text(String(text), x + 2, y + 6, options);
        }
      }
    };

    // --- PAGE 1: HEADER BLOCK ---
    doc.setFillColor(HEADER_BLUE[0], HEADER_BLUE[1], HEADER_BLUE[2]);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.text('Ayurvedic Clinical Consultation', 20, 18);
    doc.setFontSize(14);
    doc.text("Patient's Copy", 20, 28);

    // --- AI GENERATED BADGE (top-right of header) ---
    const bx = pageWidth - 40;
    const by = 7;

    // Badge background - rounded rectangle with green theme
    doc.setFillColor(60, 100, 85);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.roundedRect(bx, by, 24, 26, 2, 2, 'FD');

    // Inner border line
    doc.setDrawColor(200, 220, 210);
    doc.setLineWidth(0.2);
    doc.roundedRect(bx + 1, by + 1, 22, 24, 1.5, 1.5, 'S');

    // Top label "VERIFIED"
    doc.setFillColor(44, 70, 61);
    doc.roundedRect(bx + 3, by + 2.5, 18, 5, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(3.5);
    doc.text('VERIFIED', bx + 12, by + 6, { align: 'center' });

    // Large "AI" text
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AI', bx + 12, by + 16, { align: 'center' });

    // Divider line
    doc.setDrawColor(180, 210, 195);
    doc.setLineWidth(0.3);
    doc.line(bx + 5, by + 18, bx + 19, by + 18);

    // "GENERATED" bottom label
    doc.setTextColor(200, 225, 215);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(3);
    doc.text('GENERATED', bx + 12, by + 22, { align: 'center' });

    // Small decorative circles at corners
    doc.setFillColor(200, 225, 215);
    doc.circle(bx + 2, by + 2, 0.5, 'F');
    doc.circle(bx + 22, by + 2, 0.5, 'F');

    // --- PATIENT DEMOGRAPHICS ---
    let y = 50;
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text('Patient Demographics', 20, y);
    y += 4;

    const reportId = `AYU-${Math.floor(Math.random() * 90000) + 10000}`;
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Row 1
    drawCell(20, y, 25, 10, 'Name', true);
    drawCell(45, y, 35, 10, report.patientInfo?.name || 'Patient', false, 'left');
    if (!isEmpty(report.patientInfo?.gender)) {
      drawCell(80, y, 25, 10, 'Gender', true);
      drawCell(105, y, 30, 10, report.patientInfo.gender, false, 'left');
    }
    drawCell(135, y, 25, 10, 'Location', true);
    drawCell(160, y, 30, 10, 'Online Consult', false, 'left');
    y += 10;

    // Row 2
    drawCell(20, y, 25, 10, 'ID No.', true);
    drawCell(45, y, 35, 10, reportId, false, 'left');
    drawCell(80, y, 25, 10, 'Date', true);
    drawCell(105, y, 30, 10, currentDate, false, 'left');
    if (!isEmpty(report.patientInfo?.age)) {
      drawCell(135, y, 25, 10, 'Age', true);
      drawCell(160, y, 30, 10, sanitizeMarkdownText(String(report.patientInfo.age)), false, 'left');
    }
    y += 15;

    // --- PATIENT VITALS ---
    const hasHeight = !isEmpty(report.patientInfo?.height);
    const hasWeight = !isEmpty(report.patientInfo?.weight);
    if (hasHeight || hasWeight) {
      doc.setFillColor(LABEL_BLUE[0], LABEL_BLUE[1], LABEL_BLUE[2]);
      doc.rect(20, y, 170, 8, 'F');
      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      let vitalsText = 'Patient Vitals:';
      if (hasHeight) vitalsText += '    Height: ' + report.patientInfo.height;
      if (hasHeight && hasWeight) vitalsText += '     /';
      if (hasWeight) vitalsText += '     Weight: ' + report.patientInfo.weight;
      doc.text(vitalsText, 24, y + 5.5);
      y += 12;
    }

    // --- CLINICAL OBSERVATIONS ---
    doc.setFillColor(HEADER_BLUE[0], HEADER_BLUE[1], HEADER_BLUE[2]); // Dark blue header
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text('Medical / Clinical / Symptom History', 105, y + 5.5, { align: 'center' });
    y += 8;

    const symptomsStr = report.symptomsReported?.length ? report.symptomsReported.map(s => sanitizeMarkdownText(s)).join('; ') : '';
    const prakritiStr = report.patientInfo?.constitution ? sanitizeMarkdownText(report.patientInfo.constitution) : '';

    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    const sympTextHeight = isEmpty(symptomsStr) ? 0 : Math.max(12, doc.splitTextToSize(symptomsStr, 166).length * 5.3);
    const prakTextHeight = isEmpty(prakritiStr) ? 0 : Math.max(12, doc.splitTextToSize(prakritiStr, 166).length * 5.3);

    const blockHeight = sympTextHeight + prakTextHeight + (isEmpty(symptomsStr) && isEmpty(prakritiStr) ? 12 : 20);

    doc.setFillColor(LABEL_BLUE[0], LABEL_BLUE[1], LABEL_BLUE[2]); // Light blue body
    doc.rect(20, y, 170, blockHeight, 'F');
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.2);
    doc.rect(20, y - 8, 170, blockHeight + 8, 'S'); // Border around the whole block

    doc.setTextColor(20, 20, 20);

    let nextY = y;
    if (!isEmpty(symptomsStr)) {
      doc.setFont('times', 'bold');
      doc.text('Reported Symptoms:', 22, y + 6);
      doc.setFont('times', 'normal');
      doc.text(symptomsStr, 24, y + 12, { maxWidth: 164, align: 'left', lineHeightFactor: 1.5 });
      nextY = y + 12 + sympTextHeight;
    }

    if (!isEmpty(prakritiStr)) {
      doc.setFont('times', 'bold');
      doc.text('Prakriti:', 22, nextY + 6);
      doc.setFont('times', 'normal');
      doc.text(prakritiStr, 24, nextY + 12, { maxWidth: 164, align: 'left', lineHeightFactor: 1.5 });
    }

    y += blockHeight + 10;

    // --- MAIN DATA TABLE ---
    const calculateHeight = (text, width) => {
      if (!text) return 10;
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      const splitText = doc.splitTextToSize(String(text), width - 4);
      return Math.max(10, splitText.length * 5.3 + 6); // More padding for 1.5 lineHeight
    };

    const drawDataRowDynamic = (label, value) => {
      if (isEmpty(value)) return;
      
      let valString = '';
      if (Array.isArray(value)) {
        valString = value.map(v => sanitizeMarkdownText(v)).join('; ');
      } else {
        valString = sanitizeMarkdownText(String(value));
      }
      
      let h = calculateHeight(valString, 110);

      if (y + h > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }

      drawCell(20, y, 60, h, label, true);      // Left label cell
      drawCell(80, y, 110, h, valString, false, 'justify'); // Right value cell (Justified)
      y += h;
    };

    drawDataRowDynamic('Consultation Date / Time', new Date().toLocaleString());

    drawDataRowDynamic('Principal Doctor', 'Ayurveda AI Clinical Assistant');

    const diagnosisName = typeof report.diagnosis === 'string' ? report.diagnosis : (report.diagnosis?.name || 'Ayurvedic Assessment');
    drawDataRowDynamic('Principal Diagnosis', diagnosisName);

    const diagnosisReason = typeof report.diagnosis === 'object' ? report.diagnosis?.reasoning : null;
    drawDataRowDynamic('Reason / Clinical Assessment', diagnosisReason);

    drawDataRowDynamic('Clinical Threat Level', report.threatLevel);

    const treatmentStr = Array.isArray(report.treatments) ? report.treatments.join(', ') : report.treatments;
    drawDataRowDynamic('Ayurvedic Treatment Modalities', treatmentStr);

    drawDataRowDynamic('Dietary Inclusion (Pathya)', report.dietaryGuide?.toConsume);

    drawDataRowDynamic('Dietary Restriction (Apathya)', report.dietaryGuide?.toAvoid);

    drawDataRowDynamic('Lifestyle Adjustments', report.lifestyleChanges);

    const herbalArr = report.herbalPreparations?.length ? report.herbalPreparations.map(h => `${h.name} (${h.purpose})${h.safety ? ' - Safety: ' + h.safety : ''}`) : null;
    drawDataRowDynamic('Herbal Formulations', herbalArr);

    drawDataRowDynamic('Clinical Prognosis', report.prognosis);

    y += 10; // Space between table and disclaimer

    // --- DISCLAIMER BLOCK ---
    if (y + 25 > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(255, 243, 205); // Light warning yellow
    doc.setDrawColor(180, 150, 50);
    doc.setLineWidth(0.5);
    doc.rect(20, y, 170, 18, 'FD');
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(120, 80, 0);
    doc.text('DISCLAIMER: This report is generated by an AI-based Ayurveda Clinical Assistant.', 105, y + 6, { align: 'center' });
    doc.setFont('times', 'normal');
    doc.text('This is NOT a substitute for professional medical advice, diagnosis, or treatment.', 105, y + 11, { align: 'center' });
    doc.text('Always consult a qualified healthcare practitioner before making medical decisions.', 105, y + 16, { align: 'center' });
    y += 22;

    // --- FOOTER ---
    const drawFooter = () => {
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      doc.setFont('times', 'normal');
      doc.text('AI-GENERATED REPORT — Not a substitute for professional medical advice.   |   Ayurveda Clinical Assistant Official Copy', 105, pageHeight - 7, { align: 'center' });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      drawFooter();
    }

    const reportTitle = options.reportTitle || options.reportType || (typeof report.diagnosis === 'string' ? report.diagnosis : (report.diagnosis?.name || 'Report'));
    const safeName = String(reportTitle).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `report_${safeName || 'clinical'}.pdf`;

    doc.save(fileName)

  } catch (error) {
    console.error('CRITICAL: PDF generation failed!', error)
    alert(`Error generating PDF: ${error.message || 'Unknown error'}`)
  }
}
