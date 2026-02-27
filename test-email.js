const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
    console.log('--- Detailed Email Diagnostic ---');
    console.log('User:', process.env.EMAIL_USER);
    console.log('Pass:', 'REDACTED'); // Don't log password

    // Common config for Gmail and institutional Google accounts
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // use SSL
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        debug: true, // Log debug output
        logger: true // Log information to console
    });

    try {
        console.log('Step 1: Verifying SMTP connection...');
        await transporter.verify();
        console.log('Step 1: ✅ Success!');

        console.log('Step 2: Sending test email...');
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: 'Diagnostic Test',
            text: 'SMTP is working!'
        });
        console.log('Step 2: ✅ Success! Message ID:', info.messageId);
    } catch (err) {
        console.error('❌ ERROR:', err.message);
        if (err.code) console.error('Error Code:', err.code);
        if (err.command) console.error('Command:', err.command);
        if (err.response) console.error('Response:', err.response);
    }
}

testEmail();
