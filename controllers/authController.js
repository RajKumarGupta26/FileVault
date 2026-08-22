const User = require('../models/User');

function sendAuthResponse(user, statusCode, res) {
  const token = user.getSignedJwtToken();
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit
    }
  });
}

// POST /api/auth/signup
exports.signup = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ success: false, message: 'Name and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const loginKey = name.trim().toLowerCase();
    const existing = await User.findOne({ loginKey });
    if (existing) {
      return res.status(409).json({ success: false, message: 'That name is already taken' });
    }

    const user = await User.create({ name: name.trim(), loginKey, password });
    sendAuthResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ success: false, message: 'Name and password are required' });
    }

    const loginKey = name.trim().toLowerCase();
    const user = await User.findOne({ loginKey }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid name or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid name or password' });
    }

    sendAuthResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      storageUsed: req.user.storageUsed,
      storageLimit: req.user.storageLimit
    }
  });
};
