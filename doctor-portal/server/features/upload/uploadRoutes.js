'use strict';
const express = require('express');
const { User, Doctor } = require('../../models');
const { upload }       = require('./uploadMiddleware');

const router = express.Router();

router.post('/upload-profile-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    await User.update({ profileImage: imageUrl }, { where: { id: req.userId } });
    const user = await User.findByPk(req.userId);

    await Doctor.update({ profileImage: imageUrl }, { where: { userId: req.userId } });
    const doctor = await Doctor.findOne({ where: { userId: req.userId } });

    res.json({ imageUrl, user, doctor });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
