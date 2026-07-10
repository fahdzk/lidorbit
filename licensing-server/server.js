require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./database');
const emailService = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_DEVICES = parseInt(process.env.MAX_DEVICES, 10) || 3;
const JWT_SECRET = process.env.JWT_SECRET || 'lidorbit_secret_jwt_key_2026';

// Initialize Stripe (will fail gracefully if key is missing or is placeholder during initialization)
let stripe;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'STRIPE_SECRET_KEY_PLACEHOLDER') {
  stripe = Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('WARNING: STRIPE_SECRET_KEY is not defined or is placeholder. The server will run in MOCK mode only.');
}

app.use(cors());

// Webhook endpoint (MUST be defined before express.json() to parse raw body correctly)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) {
    console.log('[MOCK] Received webhook event');
    return res.json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`Webhook: Checkout session completed for ID ${session.id}. Payment status: ${session.payment_status}`);
  }

  res.json({ received: true });
});

app.use(express.json());

// Endpoint to create a checkout session
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe secret key is not configured on the server.' });
  }

  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId || priceId === 'STRIPE_PRICE_ID_PLACEHOLDER') {
      return res.status(400).json({ error: 'STRIPE_PRICE_ID is not configured on the server.' });
    }

    const host = req.get('host');
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const origin = req.get('origin') || `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      managed_payments: {
        enabled: true,
      },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
    }, {
      apiVersion: '2026-02-25.preview',
    });

    res.json({ url: session.url, id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session.' });
  }
});

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Success redirect: routes users to register page with Stripe session_id
app.get('/success', (req, res) => {
  const sessionId = req.query.session_id;
  if (sessionId) {
    res.redirect(`/register.html?session_id=${sessionId}`);
  } else {
    res.redirect('/register.html');
  }
});

// Health/Status check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: stripe ? 'production' : 'mock',
    maxDevices: MAX_DEVICES
  });
});

// Account Registration endpoint
app.post('/api/register', async (req, res) => {
  const { licenseKey, email, username, password } = req.body;

  if (!licenseKey || !email || !username || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!pwdRegex.test(password)) {
    return res.status(400).json({ success: false, message: 'Password does not meet universal strength standards (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character).' });
  }

  // 1. Verify that the license key is valid and paid (only supports Stripe)
  if (!licenseKey || !licenseKey.startsWith('cs_')) {
    return res.status(400).json({ success: false, message: 'Invalid license key format. Only Stripe purchases are accepted.' });
  }

  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(licenseKey);
      if (!session) {
        return res.status(400).json({ success: false, message: 'Invalid license key. Purchase session not found.' });
      }
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ success: false, message: 'This purchase session has not been completed / paid yet.' });
      }
    } catch (err) {
      console.error('Stripe check failed during registration:', err);
      return res.status(400).json({ success: false, message: 'Failed to verify license key with Stripe.' });
    }
  } else {
    // In mock mode (e.g. Stripe not configured), allow cs_ key to proceed
    console.log(`[MOCK] Verifying Stripe license key during registration: ${licenseKey}`);
  }

  // 2. Check for duplicate registrations/usernames/emails
  if (await db.findUserByUsername(username)) {
    return res.status(400).json({ success: false, message: 'Username is already taken.' });
  }

  if (await db.findUserByEmail(email)) {
    return res.status(400).json({ success: false, message: 'Email address is already registered.' });
  }

  if (await db.findUserByLicenseKey(licenseKey)) {
    return res.status(400).json({ success: false, message: 'This license key has already been used to create an account.' });
  }

  try {
    // 3. Create the user
    const passwordHash = await bcrypt.hash(password, 10);
    await db.createUser({
      username,
      email,
      passwordHash,
      licenseKey
    });

    // 4. Send welcome email (asynchronous, doesn't block response)
    emailService.sendWelcomeEmail(email, username, licenseKey).catch(console.error);

    return res.json({ success: true, message: 'Account registered successfully!' });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// Login endpoint (binds device on first login, limits to 1 device)
app.post('/api/login', async (req, res) => {
  const { usernameOrEmail, password, machineId } = req.body;

  if (!usernameOrEmail || !password || !machineId) {
    return res.status(400).json({ success: false, message: 'Username/Email, Password, and Device ID are required.' });
  }

  // 1. Look up user by username or email
  let user = await db.findUserByUsername(usernameOrEmail);
  if (!user) {
    user = await db.findUserByEmail(usernameOrEmail);
  }

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid username, email, or password.' });
  }

  // 2. Verify password
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(400).json({ success: false, message: 'Invalid username, email, or password.' });
  }

  // 2.5. Stripe License Verification Check
  if (!user.licenseKey || !user.licenseKey.startsWith('cs_')) {
    return res.status(400).json({
      success: false,
      message: 'This account does not have an active Stripe license. Please purchase a license to activate LIDORBIT.'
    });
  }

  // 3. Device Binding check (limits to MAX_DEVICES)
  const boundDevices = user.machineId ? user.machineId.split(',').map(d => d.trim()).filter(Boolean) : [];
  const isAlreadyBound = boundDevices.includes(machineId);

  if (!isAlreadyBound) {
    if (boundDevices.length < MAX_DEVICES) {
      boundDevices.push(machineId);
      const newMachineIdStr = boundDevices.join(',');
      user = await db.updateUser(user.username, { machineId: newMachineIdStr });
      console.log(`Bound user ${user.username} to device ${machineId}. Total bound: ${boundDevices.length}`);
    } else {
      return res.status(403).json({
        success: false,
        message: `Maximum device limit (${MAX_DEVICES}) reached. Please visit the web dashboard to reset your device list.`
      });
    }
  }

  // 4. Update last login timestamp in PostgreSQL
  user = await db.updateUser(user.username, { lastLogin: new Date().toISOString() });

  // 5. Generate a cryptographically signed JWT (72-hour lifetime)
  const token = jwt.sign(
    { username: user.username, machineId: machineId },
    JWT_SECRET,
    { expiresIn: '72h' }
  );

  return res.json({
    success: true,
    message: 'Login successful!',
    token,
    user: {
      username: user.username,
      email: user.email,
      licenseKey: user.licenseKey
    }
  });
});

// Request Password Reset endpoint
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  const captchaToken = req.body['cap-token'] || req.body['captchaToken'];

  // Check CAPTCHA
  const capOk = await verifyTryCap(captchaToken);
  if (!capOk) {
    return res.status(400).json({ success: false, message: 'CAPTCHA verification failed. Please check the checkbox and try again.' });
  }

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email address is required.' });
  }

  const user = await db.findUserByEmail(email);
  const successMessage = 'A password reset link has been successfully sent to your email address. Please check your inbox (and spam folder) for instructions to reset your password.';

  if (!user) {
    return res.status(404).json({ success: false, message: 'No account found with this email address.' });
  }

  try {
    // Generate token and set expiration (1 hour)
    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString();

    await db.updateUser(user.username, {
      resetToken: token,
      resetTokenExpires: expires
    });

    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    const websiteUrl = process.env.WEBSITE_URL || 'https://lidorbit.wasmer.app';
    const resetLink = `${websiteUrl}/reset.html?token=${token}`;

    try {
      await emailService.sendPasswordResetEmail(email, user.username, user.licenseKey, resetLink);
      return res.json({ success: true, message: successMessage });
    } catch (emailErr) {
      console.warn('Failed to send password reset email via Brevo:', emailErr.message);
      // Return a successful response containing the reset link directly as a fallback
      return res.json({
        success: true,
        message: `A password reset link was generated, but the email server failed to deliver it. You can reset your password directly using this link:<br><br><a href="${resetLink}" style="color: #c084fc; font-weight: 600; text-decoration: underline;" target="_blank">Reset Password Link</a>`
      });
    }
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during password reset request.' });
  }
});

// Reset Password endpoint
app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ success: false, message: 'Token and new password are required.' });
  }

  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!pwdRegex.test(password)) {
    return res.status(400).json({ success: false, message: 'Password does not meet universal strength standards (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character).' });
  }

  const user = await db.findUserByResetToken(token);
  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
  }

  // Check if token has expired
  if (new Date(user.resetTokenExpires) < new Date()) {
    return res.status(400).json({ success: false, message: 'Reset token has expired.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.updateUser(user.username, {
      passwordHash,
      resetToken: null,
      resetTokenExpires: null
    });

    // Send password reset confirmation email
    emailService.sendPasswordResetConfirmationEmail(user.email, user.username).catch(console.error);

    return res.json({ success: true, message: 'Password reset successfully!' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during password reset.' });
  }
});

// ==========================================
// CUSTOMER PORTAL WEB API ENDPOINTS
// ==========================================

// Web signup
app.post('/api/web/register', async (req, res) => {
  const { email, username, password, fullName, phone, address, sessionId } = req.body;
  const captchaToken = req.body['cap-token'] || req.body['captchaToken'];

  // Check CAPTCHA
  const capOk = await verifyTryCap(captchaToken);
  if (!capOk) {
    return res.status(400).json({ success: false, message: 'CAPTCHA verification failed. Please check the checkbox and try again.' });
  }

  if (!email || !username || !password || !fullName || !phone || !address) {
    return res.status(400).json({ success: false, message: 'All registration fields (Full Name, Email, Phone, Address, Username, Password) are required.' });
  }

  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!pwdRegex.test(password)) {
    return res.status(400).json({ success: false, message: 'Password does not meet universal strength standards (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character).' });
  }

  // Check duplicate registrations
  if (await db.findUserByUsername(username)) {
    return res.status(400).json({ success: false, message: 'Username is already taken.' });
  }

  if (await db.findUserByEmail(email)) {
    return res.status(400).json({ success: false, message: 'Email address is already registered.' });
  }

  let finalLicenseKey = null;

  // If a Stripe sessionId is supplied, verify it and immediately claim it
  if (sessionId) {
    if (!sessionId.startsWith('cs_')) {
      return res.status(400).json({ success: false, message: 'Invalid license key format. Only Stripe purchases are accepted.' });
    }

    if (await db.findUserByLicenseKey(sessionId)) {
      return res.status(400).json({ success: false, message: 'This purchase session has already been claimed.' });
    }

    if (stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session && session.payment_status === 'paid') {
          finalLicenseKey = sessionId;
        } else {
          return res.status(400).json({ success: false, message: 'Session ID is invalid or unpaid.' });
        }
      } catch (err) {
        console.error('Failed to verify session during registration:', err);
        return res.status(400).json({ success: false, message: 'Stripe session validation failed.' });
      }
    } else {
      // Mock mode fallback
      finalLicenseKey = sessionId;
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.createUser({
      username,
      email,
      fullName,
      phone,
      address,
      passwordHash,
      licenseKey: finalLicenseKey
    });

    emailService.sendWelcomeEmail(email, username, finalLicenseKey || 'None (claim yours in the dashboard)').catch(console.error);

    return res.json({ success: true, message: 'Account registered successfully!' });
  } catch (err) {
    console.error('Web registration error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// Web login (bypass device restrictions for the dashboard portal)
app.post('/api/web/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ success: false, message: 'Username/Email and Password are required.' });
  }

  let user = await db.findUserByUsername(usernameOrEmail);
  if (!user) {
    user = await db.findUserByEmail(usernameOrEmail);
  }

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid username, email, or password.' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(400).json({ success: false, message: 'Invalid username, email, or password.' });
  }

  return res.json({
    success: true,
    message: 'Login successful!',
    user: {
      username: user.username,
      email: user.email
    }
  });
});

// Fetch current user details
app.get('/api/web/user-details', async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const user = await db.findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  return res.json({
    success: true,
    user: {
      username: user.username,
      email: user.email,
      licenseKey: user.licenseKey
    }
  });
});

// Web Stripe Session checkout creation (bind metadata to username)
app.post('/api/web/create-checkout-session', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username parameter is required.' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured on the server.' });
  }

  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId || priceId === 'STRIPE_PRICE_ID_PLACEHOLDER') {
      return res.status(400).json({ error: 'STRIPE_PRICE_ID is not configured.' });
    }

    const host = req.get('host');
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const origin = req.get('origin') || `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        username: username
      },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard.html`,
    }, {
      apiVersion: '2026-02-25.preview',
    });

    res.json({ url: session.url, id: session.id });
  } catch (error) {
    console.error('Web checkout creation failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session.' });
  }
});

// Web License Claiming
app.post('/api/web/claim-license', async (req, res) => {
  const { sessionId, username } = req.body;

  if (!sessionId || !username) {
    return res.status(400).json({ success: false, message: 'Session ID and username are required.' });
  }

  if (!sessionId.startsWith('cs_')) {
    return res.status(400).json({ success: false, message: 'Invalid license key format. Only Stripe purchases are accepted.' });
  }

  const user = await db.findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (user.licenseKey) {
    return res.status(400).json({ success: false, message: 'Your account is already licensed.' });
  }

  if (await db.findUserByLicenseKey(sessionId)) {
    return res.status(400).json({ success: false, message: 'This license has already been claimed by another account.' });
  }

  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (!session) {
        return res.status(400).json({ success: false, message: 'Checkout session not found.' });
      }

      if (session.payment_status !== 'paid') {
        return res.status(400).json({ success: false, message: 'This purchase is not paid yet.' });
      }

      // Match user metadata validation
      if (!session.metadata || !session.metadata.username || session.metadata.username.toLowerCase() !== username.toLowerCase()) {
        return res.status(400).json({ success: false, message: 'This checkout session was created for a different account.' });
      }
    } catch (err) {
      console.error('Stripe check failed during license claiming:', err);
      return res.status(400).json({ success: false, message: 'Stripe validation failed.' });
    }
  }

  try {
    await db.updateUser(user.username, { licenseKey: sessionId });
    
    // Send email notification
    emailService.sendWelcomeEmail(user.email, user.username, sessionId).catch(console.error);

    return res.json({ success: true, message: 'License key successfully linked to your account!' });
  } catch (err) {
    console.error('License claim error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while linking license key.' });
  }
});

// ==========================================
// CAPTCHA VERIFICATION HELPER
// ==========================================

const verifyTryCap = async (token) => {
  const instanceUrl = process.env.TRYCAP_INSTANCE_URL;
  const siteKey = process.env.TRYCAP_SITE_KEY;
  const secretKey = process.env.TRYCAP_SECRET_KEY;

  if (!instanceUrl || !siteKey || !secretKey) {
    console.log('[MOCK] TryCap CAPTCHA is not fully configured. Skipping validation.');
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const url = `${instanceUrl.replace(/\/$/, '')}/${siteKey}/siteverify`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: secretKey,
        response: token
      })
    });
    const data = await response.json();
    return !!data.success;
  } catch (err) {
    console.error('TryCap verification request failed:', err);
    return false;
  }
};

// CAPTCHA configuration endpoint
app.get('/api/captcha-config', (req, res) => {
  res.json({
    enabled: !!(process.env.TRYCAP_INSTANCE_URL && process.env.TRYCAP_SITE_KEY && process.env.TRYCAP_SECRET_KEY),
    instanceUrl: process.env.TRYCAP_INSTANCE_URL || '',
    siteKey: process.env.TRYCAP_SITE_KEY || ''
  });
});

// Check if username is already taken
app.get('/api/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.json({ exists: false });
  }
  const user = await db.findUserByUsername(username);
  return res.json({ exists: !!user });
});

// ==========================================
// TOKEN CACHING & RESET DEVICE ENDPOINTS
// ==========================================

// Token verification endpoint for app startup
app.post('/api/verify-token', async (req, res) => {
  const { token, machineId } = req.body;
  if (!token || !machineId) {
    return res.status(400).json({ success: false, message: 'Token and Machine ID are required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify machine ID
    if (decoded.machineId !== machineId) {
      return res.status(400).json({ success: false, message: 'Machine ID mismatch.' });
    }

    // Verify user in PostgreSQL
    const user = await db.findUserByUsername(decoded.username);
    if (!user || !user.licenseKey || !user.licenseKey.startsWith('cs_')) {
      return res.status(400).json({ success: false, message: 'Account does not have a valid license key.' });
    }

    // Enforce device binding check
    const boundDevices = user.machineId ? user.machineId.split(',').map(d => d.trim()).filter(Boolean) : [];
    if (!boundDevices.includes(machineId)) {
      return res.status(403).json({ success: false, message: 'Device is not bound to this license.' });
    }

    // Return a refreshed token
    const newToken = jwt.sign(
      { username: user.username, machineId: machineId },
      JWT_SECRET,
      { expiresIn: '72h' }
    );

    return res.json({ success: true, token: newToken });
  } catch (err) {
    console.error('Token validation error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
});

// Web Reset Device Lock endpoint
app.post('/api/web/reset-device', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: 'Username parameter is required.' });
  }

  const user = await db.findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  try {
    // Reset machine_id to null
    await db.updateUser(user.username, { machineId: null });
    console.log(`Reset device lock for user ${user.username}`);
    return res.json({ success: true, message: 'Device lock successfully reset!' });
  } catch (err) {
    console.error('Reset device lock error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while resetting device lock.' });
  }
});

// Activate device using license key directly
app.post('/api/activate-by-key', async (req, res) => {
  const { licenseKey, machineId } = req.body;

  if (!licenseKey || !machineId) {
    return res.status(400).json({ success: false, message: 'License key and Device ID are required.' });
  }

  // 1. Verify format
  if (!licenseKey.startsWith('cs_')) {
    return res.status(400).json({ success: false, message: 'Invalid license key format. Only Stripe purchases are accepted.' });
  }

  try {
    // 2. Look up user by license key in database
    let user = await db.findUserByLicenseKey(licenseKey);
    if (!user) {
      return res.status(400).json({ success: false, message: 'This license key is not registered to any account.' });
    }

    // 3. Device Binding check (limits to MAX_DEVICES)
    const boundDevices = user.machineId ? user.machineId.split(',').map(d => d.trim()).filter(Boolean) : [];
    const isAlreadyBound = boundDevices.includes(machineId);

    if (!isAlreadyBound) {
      if (boundDevices.length < MAX_DEVICES) {
        boundDevices.push(machineId);
        const newMachineIdStr = boundDevices.join(',');
        user = await db.updateUser(user.username, { machineId: newMachineIdStr });
        console.log(`Bound user ${user.username} to device ${machineId}. Total bound: ${boundDevices.length}`);
      } else {
        return res.status(403).json({
          success: false,
          message: `Maximum device limit (${MAX_DEVICES}) reached. Please visit the web dashboard to reset your device list.`
        });
      }
    }

    // 4. Update last login timestamp in PostgreSQL
    user = await db.updateUser(user.username, { lastLogin: new Date().toISOString() });

    // 5. Generate a cryptographically signed JWT (72-hour lifetime)
    const token = jwt.sign(
      { username: user.username, email: user.email, machineId: machineId },
      JWT_SECRET,
      { expiresIn: '72h' }
    );

    return res.json({
      success: true,
      message: 'LidOrbit activated successfully!',
      token,
      user: {
        username: user.username,
        email: user.email,
        licenseKey: user.licenseKey
      }
    });
  } catch (err) {
    console.error('Error activating by license key:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during key activation.' });
  }
});

// Link license key manually
app.post('/api/web/link-license', async (req, res) => {
  const { username, licenseKey } = req.body;

  if (!username || !licenseKey) {
    return res.status(400).json({ success: false, message: 'Username and License Key are required.' });
  }

  if (!licenseKey.startsWith('cs_')) {
    return res.status(400).json({ success: false, message: 'Invalid license key format. Only Stripe purchase IDs (cs_...) are accepted.' });
  }

  try {
    const user = await db.findUserByUsername(username);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.licenseKey) {
      return res.status(400).json({ success: false, message: 'Your account already has an active license key.' });
    }

    // Check if the license key is already linked to another account
    const existingOwner = await db.findUserByLicenseKey(licenseKey);
    if (existingOwner) {
      return res.status(400).json({ success: false, message: 'This license key is already linked to another account.' });
    }

    // If it's a test license key, bypass Stripe checks
    if (licenseKey === 'cs_test_LIDORBIT_TEST_LICENSE') {
      await db.updateUser(user.username, { licenseKey });
      emailService.sendWelcomeEmail(user.email, user.username, licenseKey).catch(console.error);
      return res.json({ success: true, message: 'Test license linked successfully!' });
    }

    // Validate with Stripe if configured
    if (stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(licenseKey);
        if (!session) {
          return res.status(400).json({ success: false, message: 'Checkout session not found on Stripe.' });
        }
        if (session.payment_status !== 'paid') {
          return res.status(400).json({ success: false, message: 'This checkout session is not fully paid.' });
        }
      } catch (stripeErr) {
        console.error('Stripe retrieval failed for manual link:', stripeErr);
        return res.status(400).json({ success: false, message: 'Invalid checkout session ID or Stripe validation failed.' });
      }
    }

    // Link key and send welcome email
    await db.updateUser(user.username, { licenseKey });
    emailService.sendWelcomeEmail(user.email, user.username, licenseKey).catch(console.error);

    return res.json({ success: true, message: 'License key linked successfully!' });
  } catch (err) {
    console.error('Error linking license key manually:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while linking license key.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`LIDORBIT Licensing Server is running on port ${PORT}`);
  console.log(`Device limit configured: ${MAX_DEVICES}`);
});
