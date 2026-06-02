const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function updateDoctors() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Update Doc 1 (Panchakarma Specialist) to handle Vata imbalances & Ear issues
    await db.collection('doctors').updateOne(
      { "basicInfo.name": "doc 1" },
      { 
        $addToSet: { 
          "professionalInfo.treatments": { 
            $each: ["Vata Imbalance", "Prana Vata", "Karnashoola", "Ear Pain", "Kapha"] 
          } 
        } 
      }
    );
    console.log('✅ Updated "doc 1" with Vata/Karnashoola specialists');

    // Update Doc 2 (General) to handle Kapha and general imbalances
    await db.collection('doctors').updateOne(
      { "basicInfo.name": "doc 2" },
      { 
        $addToSet: { 
          "professionalInfo.treatments": { 
            $each: ["Kapha-Prana Vata Imbalance", "General"] 
          } 
        } 
      }
    );
    console.log('✅ Updated "doc 2" with Kapha-Prana Vata Imbalance');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

updateDoctors();