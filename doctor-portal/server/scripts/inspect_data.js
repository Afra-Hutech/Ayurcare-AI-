const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function run() {
  await mongoose.connect(MONGODB_URI);
  const reports = await mongoose.connection.db.collection('reports').find({}).toArray();
  const sessions = await mongoose.connection.db.collection('chat_sessions').find({ diagnosis: { $ne: null } }).toArray();
  const users = await mongoose.connection.db.collection('users').find({}).toArray();

  console.log('--- ALL USERS ---');
  console.log(users.map(u => ({ id: u._id, email: u.email })));

  console.log('--- SESSIONS WITH DIAGNOSIS ---');
  console.log(sessions.map(s => ({ 
    id: s._id, 
    uId: s.userId, 
    title: s.title,
    hasDiagnosis: !!s.diagnosis
  })));

  console.log('--- ALL REPORTS ---');
  console.log(reports.map(r => ({
    id: r._id,
    pId: r.patientId,
    diag: r.diagnosis
  })));

  process.exit();
}

run();
