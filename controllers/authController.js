const crypto = require('crypto');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/email');

function sendAuthResponse(user, statusCode, res) {
  const token = user.getSignedJwtToken();
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email || null,
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit
    }
  });
}

// POST /api/auth/signup
exports.signup = async (req, res, next) => {
  try {
    const { name, password, email } = req.body;
    if (!name || !password || !email) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email' });
    }

    const loginKey = name.trim().toLowerCase();
    const existing = await User.findOne({ loginKey });
    if (existing) {
      return res.status(409).json({ success: false, message: 'That name is already taken' });
    }

    const emailTaken = await User.findOne({ email: trimmedEmail });
    if (emailTaken) {
      return res.status(409).json({ success: false, message: 'That email is already registered' });
    }

    const user = await User.create({ name: name.trim(), loginKey, password, email: trimmedEmail });
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
      email: req.user.email || null,
      storageUsed: req.user.storageUsed,
      storageLimit: req.user.storageLimit
    }
  });
};

// POST /api/auth/forgot-password  { email }
// Always responds with a generic success message — never reveals whether
// that email exists in the system, so this can't be used to hunt for accounts.
exports.forgotPassword = async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const genericResponse = { success: true, message: 'If an account exists for that email, a reset link has been sent.' };

    const user = await User.findOne({ email });
    if (!user) return res.json(genericResponse);

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (mailErr) {
      // Don't leak mail-server errors to the client — log server-side, roll
      // back the token so a broken email setup doesn't leave a live token.
      console.error('Failed to send reset email:', mailErr.message);
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
      return res.status(500).json({ success: false, message: 'Could not send reset email — please try again later.' });
    }

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/reset-password  { token, password }
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired' });
    }

    user.password = password; // re-hashed by the pre-save hook
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    sendAuthResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};
