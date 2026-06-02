const mongoose = require('mongoose');

// CLOUD URI
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function checkDoctors() {
  await mongoose.connect(MONGODB_URI);
  const Doctor = require('./models/Doctor');
  const docs = await Doctor.find({});
  console.log('Doctors:', JSON.stringify(docs.map(d => ({id: d._id, onLeave: d.onLeave, userId: d.userId})), null, 2));
  process.exit();
}

checkDoctors();
