const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    // Any generic SMTP provider (Brevo, Resend's SMTP, Mailgun, your college's, etc.)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
  } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    // Simple path: a Gmail account with an App Password
    // (Google Account → Security → 2-Step Verification → App passwords)
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
  } else {
    console.warn('⚠️  Email is not configured — set EMAIL_USER/EMAIL_PASS (or SMTP_HOST/PORT) in .env. Password-reset emails will fail until this is set.');
    return null;
  }
  return transporter;
}

async function sendPasswordResetEmail(to, resetUrl) {
  const t = getTransporter();
  if (!t) throw new Error('Email is not configured on the server');

  await t.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: 'Reset your FileVault password',
    text: `Someone requested a password reset for your FileVault account.\n\nReset your password here (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family:sans-serif; max-width:480px; margin:0 auto;">
        <h2 style="color:#111;">Reset your FileVault password</h2>
        <p>Someone requested a password reset for your FileVault account. This link is valid for <b>1 hour</b>.</p>
        <p style="margin:24px 0;">
          <a href="${resetUrl}" style="background:#c9a15a; color:#0A0D12; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">
            Reset password
          </a>
        </p>
        <p style="color:#666; font-size:13px;">If the button doesn't work, copy this link: <br>${resetUrl}</p>
        <p style="color:#999; font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });
}

module.exports = { sendPasswordResetEmail };
