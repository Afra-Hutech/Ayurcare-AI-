const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function syncReports() {
  await mongoose.connect(MONGODB_URI);
  const Report = require('./models/Report');
  const chatSessions = await mongoose.connection.db.collection('chat_sessions').find({ 
    diagnosis: { $ne: null },
    userId: { $exists: true }
  }).toArray();

  console.log(`Analyzing ${chatSessions.length} total diagnosed sessions.`);

  for (const session of chatSessions) {
    try {
      let rj = {};
      try {
        const cleaned = session.diagnosis.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        rj = JSON.parse(cleaned.substring(start, end + 1));
      } catch (e) {
        console.log(`[Session ID: ${session._id}] Failed to parse JSON diagnosis, skipping...`);
        continue;
      }

      const diagName = (rj.diagnosis && typeof rj.diagnosis === 'object') ? rj.diagnosis.name : (rj.diagnosis || session.title);
      
      // We check if a report with this sessionId already exists
      const existing = await Report.findOne({
        sessionId: session._id
      });

      if (!existing) {
        const report = new Report({
          patientId: session.userId,
          sessionId: session._id,
          diagnosis: diagName,
          symptoms: Array.isArray(rj.findings) ? rj.findings.join(', ') : (rj.findings || 'Clinical symptoms'),
          recommendations: Array.isArray(rj.root_causes) ? rj.root_causes.join(', ') : (rj.root_causes || 'Holistic guidelines provided'),
          date: new Date(session.createdAt).toISOString().split('T')[0],
          createdAt: session.createdAt
        });
        await report.save();
        console.log(`✅ SYNCED: ${diagName} (SID: ${session._id})`);
      } else {
        console.log(`ℹ️ EXISTS: ${diagName} (SID: ${session._id})`);
      }
    } catch (err) {
      console.error(`❌ ERROR [${session._id}]:`, err.message);
    }
  }

  process.exit();
}

syncReports();
