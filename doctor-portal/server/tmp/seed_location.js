const mongoose = require('mongoose');

// CLOUD URI - Hardcoded for connection
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Define a simple schema matching Doctor model
    const DoctorSchema = new mongoose.Schema({
      basicInfo: { name: String, email: String },
      location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], index: '2dsphere' }
      }
    });
    
    const Doctor = mongoose.model('Doctor', DoctorSchema);
    
    // Bangalore HSR Layout coordinates (near the user's lat/lng)
    const bangaloreLat = 12.914589;
    const bangaloreLng = 77.635239;
    
    // Update or create at least one doctor with good data
    const result = await Doctor.updateMany(
      {}, // All existing doctors
      { 
        $set: { 
          location: { 
            type: 'Point', 
            coordinates: [bangaloreLng, bangaloreLat] 
          } 
        } 
      }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} doctors with valid location data.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

seed();
