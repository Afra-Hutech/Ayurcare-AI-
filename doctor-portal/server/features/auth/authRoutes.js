const express = require('express');
const { signup, login, getMe, forgotPassword, resetPassword } = require('./authController');
const { authenticateToken } = require('./authMiddleware');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authenticateToken, getMe);

module.exports = router;
