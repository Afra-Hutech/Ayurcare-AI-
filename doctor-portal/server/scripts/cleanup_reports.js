const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function run() {
  await mongoose.connect(MONGODB_URI);
  const Report = require('./models/Report');
  const result = await Report.deleteMany({ sessionId: { $exists: false } });
  console.log(`Deleted reports without sessionId: ${result.deletedCount}`);
  process.exit();
}

run();
