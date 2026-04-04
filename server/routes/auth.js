const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'bookstore-secret-key-2024';
const ISSUER = 'BookHaven';

const { User } = (() => {
  // Lazy require to keep this file self-contained.
  return { User: require('../models/User') };
})();

function safeUser(user) {
  const activeCoupons = (user.coupons || []).filter(c => {
    if (c.status !== 'active') return false;
    if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
    return true;
  });
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    walletBalance: Number(user.walletBalance || 0),
    activeCouponsCount: activeCoupons.length,
    activeCouponsValue: activeCoupons.reduce((sum, c) => sum + Number(c.amount || 0), 0)
  };
}

function createToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function createOtpSetupToken(userId) {
  return createToken({ userId: String(userId), type: 'mfa_setup' }, '10m');
}

function createOtpLoginToken(userId) {
  return createToken({ userId: String(userId), type: 'mfa_login' }, '10m');
}

function getVerifiedToken(req, expectedType) {
  const token =
    req.body?.setupToken ||
    req.body?.mfaToken ||
    req.query?.token ||
    req.headers?.authorization?.split('Bearer ')?.[1];

  if (!token) return { ok: false, message: 'Token missing' };

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== expectedType) {
      return { ok: false, message: 'Invalid token type' };
    }
    return { ok: true, decoded };
  } catch (e) {
    return { ok: false, message: 'Invalid or expired token' };
  }
}

async function ensureTotpSecret(user) {
  if (user.totpSecret) return user.totpSecret;
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${ISSUER}:${user.email}`,
    issuer: ISSUER
  });
  user.totpSecret = secret.base32;
  user.totpEnabled = false;
  await user.save();
  return secret.base32;
}

function buildOtpAuthUrl(secretBase32, user) {
  // speakeasy can generate otpauth url from secret/base32
  return speakeasy.otpauthURL({
    secret: secretBase32,
    label: `${ISSUER}:${user.email}`,
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    encoding: 'base32'
  });
}

// Register: creates user in MongoDB + generates a TOTP secret (OTP setup required)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = new User({
      name: String(name).trim(),
      email: normalizedEmail,
      password: String(password),
      role: 'user',
      totpEnabled: false
    });

    // Create secret now; user must verify OTP once via setup page.
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `${ISSUER}:${user.email}`,
      issuer: ISSUER
    });
    user.totpSecret = secret.base32;

    await user.save();

    const setupToken = createOtpSetupToken(user._id);
    const otpauthUrl = secret.otpauth_url || buildOtpAuthUrl(secret.base32, user);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    res.status(201).json({
      message: 'Registration successful. Setup OTP to complete login.',
      user: safeUser(user),
      setupRequired: true,
      setupToken,
      qrDataUrl
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// Login: verifies password, then requires OTP if totpEnabled is true,
// otherwise requires OTP setup.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await user.comparePassword(String(password));
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    // If OTP is not enabled yet, force setup.
    if (!user.totpSecret || user.totpEnabled !== true) {
      await ensureTotpSecret(user);
      const setupToken = createOtpSetupToken(user._id);
      return res.json({
        message: 'OTP setup required',
        mfaSetupRequired: true,
        setupToken,
        user: safeUser(user)
      });
    }

    // OTP enabled => require login OTP verification.
    const mfaToken = createOtpLoginToken(user._id);
    return res.json({
      message: 'OTP required',
      mfaRequired: true,
      mfaToken,
      user: safeUser(user)
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// Get QR for setup page
router.get('/mfa/setup', async (req, res) => {
  try {
    const token = req.query?.token;
    if (!token) return res.status(400).json({ message: 'token query param required' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid or expired setup token' });
    }
    if (decoded.type !== 'mfa_setup') {
      return res.status(400).json({ message: 'Invalid token type' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await ensureTotpSecret(user);
    const otpauthUrl = buildOtpAuthUrl(user.totpSecret, user);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    res.json({ userId: String(user._id), qrDataUrl, otpauthUrl, totpEnabled: user.totpEnabled });
  } catch (e) {
    console.error('mfa/setup error:', e);
    res.status(500).json({ message: 'Setup error', error: e.message });
  }
});

// Verify OTP setup and enable TOTP for the user
router.post('/mfa/verify-setup', async (req, res) => {
  try {
    const { setupToken, otp } = req.body || {};
    if (!setupToken || !otp) {
      return res.status(400).json({ message: 'setupToken and otp are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(setupToken, JWT_SECRET);
    } catch {
      return res.status(400).json({ message: 'Invalid or expired setup token' });
    }

    if (decoded.type !== 'mfa_setup') {
      return res.status(400).json({ message: 'Invalid token type' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await ensureTotpSecret(user);

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: String(otp),
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.totpEnabled = true;
    await user.save();

    const token = createToken({ userId: user._id }, '7d');
    res.json({ message: 'OTP enabled', token, user: safeUser(user) });
  } catch (e) {
    console.error('verify-setup error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// Verify OTP during login and return JWT
router.post('/mfa/verify-login', async (req, res) => {
  try {
    const { mfaToken, otp } = req.body || {};
    if (!mfaToken || !otp) {
      return res.status(400).json({ message: 'mfaToken and otp are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(mfaToken, JWT_SECRET);
    } catch {
      return res.status(400).json({ message: 'Invalid or expired mfa token' });
    }

    if (decoded.type !== 'mfa_login') {
      return res.status(400).json({ message: 'Invalid token type' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.totpSecret || user.totpEnabled !== true) {
      return res.status(400).json({ message: 'OTP is not enabled for this user' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: String(otp),
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const token = createToken({ userId: user._id }, '7d');
    res.json({ message: 'Login successful', token, user: safeUser(user) });
  } catch (e) {
    console.error('verify-login error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// Get current user from JWT
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Not authenticated' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('name email role walletBalance coupons');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const activeCoupons = (user.coupons || []).filter(c => c.status === 'active' && (!c.expiresAt || new Date(c.expiresAt) >= new Date()));
    res.json({
      _id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      walletBalance: Number(user.walletBalance || 0),
      activeCouponsCount: activeCoupons.length,
      activeCouponsValue: activeCoupons.reduce((sum, c) => sum + Number(c.amount || 0), 0)
    });
  } catch (e) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;

