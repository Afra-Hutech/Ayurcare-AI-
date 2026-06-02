const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function checkData() {
  await mongoose.connect(MONGODB_URI);
  const Report = require('./models/Report');
  const chatSessions = await mongoose.connection.db.collection('chat_sessions').find({ diagnosis: { $ne: null } }).toArray();
  const reports = await Report.find({});

  console.log('--- Chat Sessions with Diagnosis ---');
  console.log(JSON.stringify(chatSessions.map(s => ({
    _id: s._id,
    userId: s.userId,
    title: s.title,
    hasDiagnosis: !!s.diagnosis
  })), null, 2));

  console.log('--- Reports Collection ---');
  console.log(JSON.stringify(reports.map(r => ({
    _id: r._id,
    patientId: r.patientId,
    diagnosis: r.diagnosis
  })), null, 2));

  process.exit();
}

checkData();
