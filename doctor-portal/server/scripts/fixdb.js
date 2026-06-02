const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect').then(async () => {
  const db = mongoose.connection.db.collection('doctors');
  await db.updateOne({ 'basicInfo.name': 'doc 1' }, { $set: { 'professionalInfo.treatments': ['General Consultation', 'Panchakarma'] } });
  await db.updateOne({ 'basicInfo.name': 'doc 2' }, { $set: { 'professionalInfo.treatments': ['General Consultation'] } });
  await db.updateOne({ 'basicInfo.name': 'doc 3' }, { $set: { 'professionalInfo.treatments': ['Orthopedics (Bones)'] } });
  console.log('DB UPDATED');
  process.exit();
});
