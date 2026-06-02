/**
 * Seed script: creates 3 Ayurvedic doctors in local MongoDB
 * Run from: doctor-portal/server/
 *   node seed_doctors.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/doctor_portal';

// ── Minimal inline schemas (avoids ES-module import issues) ─────────────────

const UserSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name:     { type: String, default: 'Patient' },
  role:     { type: String, enum: ['patient', 'doctor'], default: 'patient' },
  phone:    String,
  isOnboarded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const DoctorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  basicInfo: {
    name: String, age: Number, gender: String, phone: String, email: String, profileImage: String,
  },
  professionalInfo: {
    qualification: String, specialization: String, experience: Number, treatments: [String],
  },
  clinicInfo: {
    clinicName: String, address: String, city: String, state: String, pincode: String,
  },
  availability: {
    timings: String, fees: Number, languages: String,
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
  },
  status:    { type: String, enum: ['available', 'busy', 'unavailable'], default: 'available' },
  onLeave:   { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
DoctorSchema.index({ location: '2dsphere' });

const User   = mongoose.models.User   || mongoose.model('User',   UserSchema);
const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', DoctorSchema);

// ── Doctor seed data ─────────────────────────────────────────────────────────

const DOCTORS = [
  {
    email:    'dr.priya.sharma@ayurcare.com',
    password: 'Doctor@1234',
    name:     'Dr. Priya Sharma',
    phone:    '+91-9876543210',
    basicInfo: {
      name: 'Dr. Priya Sharma', age: 38, gender: 'Female',
      phone: '+91-9876543210', email: 'dr.priya.sharma@ayurcare.com',
    },
    professionalInfo: {
      qualification:  'BAMS, MD (Ayurveda)',
      specialization: 'Panchakarma & Digestive Disorders',
      experience:     12,
      treatments:     ['Panchakarma', 'Vasti', 'Virechana', 'Abhyanga', 'Nasyam'],
    },
    clinicInfo: {
      clinicName: 'Ayur Wellness Clinic',
      address:    '14, 5th Cross, HSR Layout Sector 7',
      city:       'Bangalore',
      state:      'Karnataka',
      pincode:    '560102',
    },
    availability: { timings: 'Mon-Sat 9AM-6PM', fees: 500, languages: 'English, Hindi, Kannada' },
    location: { type: 'Point', coordinates: [77.635239, 12.914589] },
  },
  {
    email:    'dr.arjun.menon@ayurcare.com',
    password: 'Doctor@1234',
    name:     'Dr. Arjun Menon',
    phone:    '+91-9845012345',
    basicInfo: {
      name: 'Dr. Arjun Menon', age: 45, gender: 'Male',
      phone: '+91-9845012345', email: 'dr.arjun.menon@ayurcare.com',
    },
    professionalInfo: {
      qualification:  'BAMS, MD (Kayachikitsa)',
      specialization: 'Rasayana & Chronic Disease Management',
      experience:     18,
      treatments:     ['Rasayana Chikitsa', 'Shirodhara', 'Kativasti', 'Herbal Formulations', 'Yoga Therapy'],
    },
    clinicInfo: {
      clinicName: 'Vaidya Heritage Centre',
      address:    '88, 27th Main, HSR Layout Sector 2',
      city:       'Bangalore',
      state:      'Karnataka',
      pincode:    '560102',
    },
    availability: { timings: 'Mon-Fri 10AM-7PM', fees: 700, languages: 'English, Hindi, Malayalam, Kannada' },
    location: { type: 'Point', coordinates: [77.641200, 12.910100] },
  },
  {
    email:    'dr.kavitha.nair@ayurcare.com',
    password: 'Doctor@1234',
    name:     'Dr. Kavitha Nair',
    phone:    '+91-9900112233',
    basicInfo: {
      name: 'Dr. Kavitha Nair', age: 34, gender: 'Female',
      phone: '+91-9900112233', email: 'dr.kavitha.nair@ayurcare.com',
    },
    professionalInfo: {
      qualification:  'BAMS, PG Diploma in Yoga & Naturopathy',
      specialization: 'Skin & Lifestyle Disorders',
      experience:     8,
      treatments:     ['Lepanam', 'Udwarthanam', 'Thakradhara', 'Ksheera Dhoomam', 'Detox Therapy'],
    },
    clinicInfo: {
      clinicName: 'Prakriti Skin & Wellness',
      address:    '32, 19th Cross, HSR Layout Sector 4',
      city:       'Bangalore',
      state:      'Karnataka',
      pincode:    '560102',
    },
    availability: { timings: 'Tue-Sun 9AM-5PM', fees: 450, languages: 'English, Tamil, Kannada' },
    location: { type: 'Point', coordinates: [77.638500, 12.916800] },
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB:', MONGO_URI);

  let created = 0;
  let skipped = 0;

  for (const data of DOCTORS) {
    const exists = await User.findOne({ email: data.email });
    if (exists) {
      console.log(`  SKIP  ${data.email} (already exists)`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await User.create({
      email: data.email,
      password: hashed,
      name: data.name,
      role: 'doctor',
      phone: data.phone,
      isOnboarded: true,
    });

    await Doctor.create({
      userId: user._id,
      basicInfo:        data.basicInfo,
      professionalInfo: data.professionalInfo,
      clinicInfo:       data.clinicInfo,
      availability:     data.availability,
      location:         data.location,
      status:           'available',
    });

    console.log(`  CREATED  ${data.email}`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
