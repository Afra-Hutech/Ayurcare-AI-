const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&appName=doc-connect';

async function checkUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    const User = mongoose.model('User', new mongoose.Schema({ email: String }));
    const user = await User.findOne({ email: 'user1@gmail.com' });
    if (user) {
      console.log('✅ Found user:', user.email);
    } else {
      console.log('❌ User not found');
    }
    const allUsers = await User.find({}, { email: 1 });
    console.log('Total users:', allUsers.length);
    console.log('First 5 users:', allUsers.slice(0, 5).map(u => u.email));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

checkUser();
