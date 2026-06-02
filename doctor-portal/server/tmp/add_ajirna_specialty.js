const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function updateAjirna() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Update Doc 2 to handle Ajirna and Indigestion
    const result2 = await db.collection('doctors').updateOne(
      { "basicInfo.name": "doc 2" },
      { 
        $addToSet: { 
          "professionalInfo.treatments": { 
            $each: ["Ajirna", "Indigestion", "Digestive Health"] 
          } 
        } 
      }
    );
    console.log(`✅ Updated doc 2: ${result2.matchedCount} matched, ${result2.modifiedCount} modified`);

    // Update Doc 3 to handle Ajirna
    const result3 = await db.collection('doctors').updateOne(
      { "basicInfo.name": "doc 3" },
      { 
        $addToSet: { 
          "professionalInfo.treatments": { 
            $each: ["Ajirna", "Gastroenterology"] 
          } 
        } 
      }
    );
    console.log(`✅ Updated doc 3: ${result3.matchedCount} matched, ${result3.modifiedCount} modified`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

updateAjirna();