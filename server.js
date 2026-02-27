require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Email transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from: `"Weather App" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Your Weather App Verification Code',
        html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); border-radius: 16px; padding: 40px; color: #fff;">
        <h1 style="text-align: center; font-size: 28px; margin-bottom: 8px;">🌤️ Weather App</h1>
        <p style="text-align: center; color: #a0aec0; margin-bottom: 32px;">Email Verification</p>
        <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="color: #a0aec0; margin-bottom: 12px;">Your verification code is:</p>
          <h2 style="font-size: 40px; letter-spacing: 12px; color: #7c3aed; margin: 0;">${otp}</h2>
        </div>
        <p style="text-align: center; color: #718096; font-size: 14px;">This code expires in <strong>10 minutes</strong>.</p>
        <p style="text-align: center; color: #718096; font-size: 12px; margin-top: 24px;">If you didn't request this, please ignore this email.</p>
      </div>
    `
    };
    await transporter.sendMail(mailOptions);
}

// ==================== API ROUTES ====================

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user already exists
        const existing = db.findUserByEmail(email);
        if (existing && existing.is_verified) {
            return res.status(400).json({ error: 'User already exists. Please login.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const otp = generateOTP();
        const otpExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        if (existing && !existing.is_verified) {
            // Update existing unverified user
            db.updateUser(email, {
                password_hash: passwordHash,
                otp: otp,
                otp_expires_at: otpExpiresAt
            });
        } else {
            // Insert new user
            db.addUser({
                email,
                password_hash: passwordHash,
                otp,
                otp_expires_at: otpExpiresAt
            });
        }

        // Send OTP email
        try {
            await sendOTPEmail(email, otp);
        } catch (mailErr) {
            console.error('Email send error:', mailErr);
            return res.status(500).json({ error: 'Failed to send verification email. Please check server logs.' });
        }

        res.json({ message: 'OTP sent to your email', email });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = db.findUserByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
        }

        if (Date.now() > user.otp_expires_at) {
            return res.status(400).json({ error: 'OTP has expired. Please register again.' });
        }

        // Mark user as verified and clear OTP
        db.updateUser(email, {
            is_verified: 1,
            otp: null,
            otp_expires_at: null
        });

        // Create session
        req.session.userId = user.id;
        req.session.email = email;

        res.json({ message: 'Email verified successfully!', redirect: '/dashboard.html' });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = db.findUserByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Check if user is verified
        if (!user.is_verified) {
            // Resend OTP for unverified user
            const otp = generateOTP();
            const otpExpiresAt = Date.now() + 10 * 60 * 1000;
            db.updateUser(email, {
                otp: otp,
                otp_expires_at: otpExpiresAt
            });
            await sendOTPEmail(email, otp);
            return res.json({ needsOTP: true, email, message: 'Please verify your email. OTP sent.' });
        }

        // Create session for verified user
        req.session.userId = user.id;
        req.session.email = email;

        res.json({ message: 'Login successful!', redirect: '/dashboard.html' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Check session
app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, email: req.session.email });
    } else {
        res.json({ loggedIn: false });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

// Weather API proxy
app.get('/api/weather', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Please login first' });
        }

        const { city } = req.query;
        if (!city) {
            return res.status(400).json({ error: 'City name is required' });
        }

        const apiKey = process.env.WEATHER_API_KEY;

        // Mock data fallback if key is missing or set to 'mock'
        if (!apiKey || apiKey === 'your_openweathermap_api_key_here' || apiKey.includes('zpka')) {
            console.log('Using mock weather data...');
            return res.json({
                current: {
                    name: city,
                    sys: { country: 'MOCK' },
                    main: { temp: 22, humidity: 55, pressure: 1012, feels_like: 21 },
                    wind: { speed: 5 },
                    weather: [{ description: 'partly cloudy (MOCK)', icon: '03d' }]
                },
                forecast: {
                    list: [
                        { dt: Date.now() / 1000 + 86400, dt_txt: '2026-02-27 12:00:00', main: { temp: 24 }, weather: [{ icon: '01d' }] },
                        { dt: Date.now() / 1000 + 172800, dt_txt: '2026-02-28 12:00:00', main: { temp: 20 }, weather: [{ icon: '02d' }] },
                        { dt: Date.now() / 1000 + 259200, dt_txt: '2026-03-01 12:00:00', main: { temp: 18 }, weather: [{ icon: '04d' }] },
                        { dt: Date.now() / 1000 + 345600, dt_txt: '2026-03-02 12:00:00', main: { temp: 21 }, weather: [{ icon: '10d' }] },
                        { dt: Date.now() / 1000 + 432000, dt_txt: '2026-03-03 12:00:00', main: { temp: 23 }, weather: [{ icon: '01d' }] }
                    ]
                }
            });
        }

        // Current weather
        const currentRes = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`
        );
        const currentData = await currentRes.json();

        if (currentData.cod !== 200) {
            return res.status(404).json({ error: currentData.message || 'City not found' });
        }

        // 5-day forecast
        const forecastRes = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`
        );
        const forecastData = await forecastRes.json();

        res.json({ current: currentData, forecast: forecastData });
    } catch (error) {
        console.error('Weather API error:', error);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🌤️  Weather App running at http://localhost:${PORT}\n`);
});
