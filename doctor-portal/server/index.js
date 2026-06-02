const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sequelize = require('./db/sequelize');
require('./models'); // register all Sequelize models so sync() can create their tables

const chatRoutes = require('./features/chat/chatRoutes');
const authRoutes = require('./features/auth/authRoutes');
const patientRoutes = require('./features/patient/patientRoutes');
const doctorRoutes = require('./features/doctor/doctorRoutes');
const appointmentRoutes = require('./features/appointments/appointmentRoutes');
const publicRoutes = require('./features/public/publicRoutes');
const uploadRoutes = require('./features/upload/uploadRoutes');
const healthRoutes = require('./features/health/healthRoutes');
const scheduleRoutes = require('./features/schedule/scheduleRoutes');
const livekitRoutes   = require('./features/livekit/livekitRoutes');
const paymentRoutes   = require('./features/payments/paymentRoutes');
const { getRevenueSummary } = require('./features/doctor/doctorController');
const { authenticateToken, JWT_SECRET } = require('./features/auth/authMiddleware');
const { registerChatSocket } = require('./features/chat/chatSocket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});
app.set('io', io);
app.set('chatRealtime', registerChatSocket({ io, jwtSecret: JWT_SECRET }));

app.use((req, res, next) => {
  console.log(`🔌 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'running', server: 'DocConnect Backend' });
});

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// ── Patient auth — public Postgres endpoints (must come BEFORE protected /api/patient) ──
const { login: _authLogin, signup: _authSignup, forgotPassword: _forgotPw, resetPassword: _resetPw } =
  require('./features/auth/authController');

app.post('/api/patient/login', _authLogin);
app.post('/api/patient/signup', (req, res) => {
  req.body = { ...req.body, role: 'patient' };
  _authSignup(req, res);
});
app.post('/api/patient/forgot-password', _forgotPw);
app.post('/api/patient/reset-password',   _resetPw);

// Protected routes (chat before generic /api upload mount)
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api', authenticateToken, uploadRoutes);
app.use('/api/patient', authenticateToken, patientRoutes);
// Explicit mount so revenue works even if router cache is stale on hot-reload
app.get('/api/doctor/revenue-summary', authenticateToken, getRevenueSummary);
app.use('/api/doctor', doctorRoutes); // Already has middleware in router
app.use('/api/doctor/schedule', scheduleRoutes);
app.use('/api/appointments', authenticateToken, appointmentRoutes);
app.use('/api/livekit',   authenticateToken, livekitRoutes);
app.use('/api/payments', authenticateToken, paymentRoutes);

// ── Boot sequence: verify PostgreSQL, sync tables, then accept traffic ────────
sequelize.authenticate()
  .then(() => {
    console.log('✅ PostgreSQL Connected Successfully!');
    return sequelize.sync({ alter: false }); // create missing tables; never drops columns
  })
  .then(() => {
    console.log('✅ All tables synced.');

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log('💬 Doctor–patient chat: /api/chat/list, /api/chat/initiate, /api/chat/messages');
      console.log('💰 Revenue report: GET /api/doctor/revenue-summary (Bearer token required)');
      console.log('📹 LiveKit: POST /api/livekit/appointments/:id/token (Bearer token required)');
      console.log('🌿 Ayurvedic guide: POST /api/patient/recommendations/:sessionId (proxies bot-brain)');
    });
  })
  .catch((err) => {
    console.error('❌ PostgreSQL Connection Error — server will not start:', err.message);
    process.exit(1);
  });
