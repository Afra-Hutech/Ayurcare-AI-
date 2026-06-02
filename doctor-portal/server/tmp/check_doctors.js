const mongoose = require('mongoose');

// CLOUD URI - Hardcoded for connection
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function check() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Define a simple schema to just count/find
    const DoctorSchema = new mongoose.Schema({
      basicInfo: { name: String },
      location: {
        type: { type: String },
        coordinates: [Number]
      }
    });
    
    const Doctor = mongoose.model('Doctor', DoctorSchema);
    const count = await Doctor.countDocuments();
    console.log(`🔍 Total Doctors: ${count}`);
    
    const doctors = await Doctor.find().limit(5);
    console.log('📋 Sample Doctors Location Data:');
    doctors.forEach(dr => {
      console.log(`- ${dr.basicInfo.name}: ${JSON.stringify(dr.location)}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

check();
