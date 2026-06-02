const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function listDoctors() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const doctors = await db.collection('doctors').find({}).toArray();
    
    console.log(`🔍 Total Doctors found: ${doctors.length}`);
    
    doctors.forEach(dr => {
      console.log('-----------------------------------');
      console.log(`Name: ${dr.basicInfo?.name}`);
      console.log(`Specialization: ${dr.professionalInfo?.specialization}`);
      console.log(`Treatments: ${JSON.stringify(dr.professionalInfo?.treatments || [])}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

listDoctors();