const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function testUpdate() {
  await mongoose.connect(MONGODB_URI);
  const Doctor = require('./models/Doctor');
  
  // get one doc
  let doc = await Doctor.findOne();
  console.log('Before update onLeave:', doc.onLeave);
  
  // set it to true
  doc.onLeave = true;
  await doc.save();
  console.log('Saved to true. Now onLeave:', doc.onLeave);

  // simulate updateProfile (patch)
  const reqBody = {
    basicInfo: doc.basicInfo
  };
  
  const updatedDoc = await Doctor.findOneAndUpdate(
    { userId: doc.userId },
    { ...reqBody, updatedAt: Date.now() },
    { new: true, upsert: true }
  );
  
  console.log('After updateProfile, onLeave:', updatedDoc.onLeave);
  process.exit();
}

testUpdate();
