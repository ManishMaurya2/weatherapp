require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const cors = require('cors');

const fetch = global.fetch || require('node-fetch');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

/* =======================
   BASIC MIDDLEWARE
======================= */

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Required for Render / HTTPS proxy
app.set('trust proxy', 1);

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

/* =======================
   EMAIL CONFIG
======================= */

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/* =======================
   HELPERS
======================= */

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from: `"Weather App" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Your Weather App Verification Code',
        html: `
        <div style="font-family: Arial; max-width: 480px; margin: auto;">
            <h2>Weather App Verification</h2>
            <p>Your OTP:</p>
            <h1>${otp}</h1>
            <p>Expires in 10 minutes.</p>
        </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

/* =======================
   AUTH ROUTES
======================= */

app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: 'Email and password required' });

        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const existing = db.findUserByEmail(email);

        if (existing && existing.is_verified)
            return res.status(400).json({ error: 'User already exists. Please login.' });

        const passwordHash = await bcrypt.hash(password, 12);
        const otp = generateOTP();
        const otpExpiresAt = Date.now() + 10 * 60 * 1000;

        if (existing && !existing.is_verified) {
            db.updateUser(email, {
                password_hash: passwordHash,
                otp,
                otp_expires_at: otpExpiresAt
            });
        } else {
            db.addUser({
                email,
                password_hash: passwordHash,
                otp,
                otp_expires_at: otpExpiresAt
            });
        }

        await sendOTPEmail(email, otp);

        res.json({ message: 'OTP sent to your email', email });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/verify-otp', (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = db.findUserByEmail(email);
        if (!user)
            return res.status(400).json({ error: 'User not found' });

        if (user.otp !== otp)
            return res.status(400).json({ error: 'Invalid OTP' });

        if (Date.now() > user.otp_expires_at)
            return res.status(400).json({ error: 'OTP expired' });

        db.updateUser(email, {
            is_verified: 1,
            otp: null,
            otp_expires_at: null
        });

        req.session.userId = user.id;
        req.session.email = email;

        res.json({ message: 'Email verified', redirect: '/dashboard.html' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: 'Email and password required' });

        const user = db.findUserByEmail(email);
        if (!user)
            return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch)
            return res.status(400).json({ error: 'Invalid credentials' });

        if (!user.is_verified) {
            const otp = generateOTP();
            const otpExpiresAt = Date.now() + 10 * 60 * 1000;

            db.updateUser(email, { otp, otp_expires_at: otpExpiresAt });
            await sendOTPEmail(email, otp);

            return res.json({ needsOTP: true, email });
        }

        req.session.userId = user.id;
        req.session.email = email;

        res.json({ message: 'Login successful', redirect: '/dashboard.html' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/session', (req, res) => {
    if (req.session.userId)
        res.json({ loggedIn: true, email: req.session.email });
    else
        res.json({ loggedIn: false });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err)
            return res.status(500).json({ error: 'Logout failed' });

        res.json({ message: 'Logged out successfully' });
    });
});

/* =======================
   WEATHER ROUTE
======================= */

app.get('/api/weather', async (req, res) => {
    try {
        if (!req.session.userId)
            return res.status(401).json({ error: 'Please login first' });

        const { city } = req.query;
        if (!city)
            return res.status(400).json({ error: 'City required' });

        const apiKey = process.env.WEATHER_API_KEY;
        if (!apiKey)
            return res.status(500).json({ error: 'Weather API key missing' });

        const currentRes = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`
        );
        const currentData = await currentRes.json();

        if (currentData.cod !== 200)
            return res.status(404).json({ error: currentData.message });

        const forecastRes = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`
        );
        const forecastData = await forecastRes.json();

        res.json({ current: currentData, forecast: forecastData });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Weather fetch failed' });
    }
});

/* =======================
   START SERVER
======================= */

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});