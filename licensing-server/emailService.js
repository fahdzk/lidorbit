const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Reads and base64 encodes the LidOrbit logo for email attachment.
 */
function getLogoAttachment() {
  try {
    const logoPath = path.join(__dirname, 'public/img/lidorbit_logo.png');
    if (fs.existsSync(logoPath)) {
      const content = fs.readFileSync(logoPath).toString('base64');
      return [
        {
          content: content,
          name: 'lidorbit_logo.png'
        }
      ];
    }
  } catch (err) {
    console.error('Failed to read logo attachment:', err);
  }
  return [];
}

/**
 * Sends a transactional email using the Brevo HTTP API v3.
 * Falls back to console logging if the API key is not configured.
 */
async function sendEmailViaBrevo(toEmail, username, subject, textContent, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY || process.env.SMTP_PASS;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'support@lidorbit.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'LIDORBIT Support';

  if (!apiKey || 
      apiKey === 'your_brevo_smtp_key_here' || 
      apiKey === 'BREVO_API_KEY_PLACEHOLDER' || 
      apiKey.includes('placeholder')) {
    throw new Error('Brevo API key is not configured on the server.');
  }

  const logoAttachments = getLogoAttachment();

  // Build request payload for Brevo API v3
  const payload = JSON.stringify({
    sender: {
      name: senderName,
      email: senderEmail
    },
    to: [
      {
        email: toEmail,
        name: username
      }
    ],
    subject: subject,
    htmlContent: htmlContent,
    textContent: textContent,
    attachment: logoAttachments.length > 0 ? logoAttachments : undefined
  });

  const options = {
    hostname: 'api.brevo.com',
    port: 443,
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[BREVO] Email successfully sent to ${toEmail}`);
          resolve(JSON.parse(responseBody));
        } else {
          console.error(`[BREVO] API Error (Status ${res.statusCode}):`, responseBody);
          reject(new Error(`Brevo API returned status ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[BREVO] HTTP Request Error:', err);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Sends a welcome email to the newly registered user.
 */
async function sendWelcomeEmail(toEmail, username, licenseKey) {
  const subject = 'Welcome to LidOrbit! Your Lifetime License is Ready';
  
  const textContent = `Hello ${username},\n\nThank you for purchasing LidOrbit!\n\nI'm Fahd Ali, the founder and CEO of LidOrbit. I wanted to personally welcome you and share the story of how LidOrbit came to life.\n\nIt started as an idea born out of frustration. I was a struggling software developer, sipping coffee at a local coffee shop, racing against a tight deadline. Suddenly, the shop got extremely loud and they announced they were shutting down. I had no choice but to pack up, close my laptop lid, and seek another workspace. But closing the lid meant interrupting my active coding sessions and stopping the AI agents I had running in the background.\n\nThat moment of frustration led to LidOrbit. Now, you can simply close your laptop lid, put it in your bag, and seek a new spot without interrupting your workflows or stopping your AI agents. Plus, we've built in a battery safety guardrail that alerts you when your battery drops below 10%, so your computer stays safe. It's a true win-win for modern developers.\n\nHere are your account details:\n- Username: ${username}\n- License Key: ${licenseKey}\n\nTo activate LidOrbit on your device:\n1. Launch the LidOrbit desktop application.\n2. Enter your username/email and password to log in.\n\n*Important: Your account is limited to a single device. Once logged in, it will be locked to that device. To use it on another machine, you will need to purchase another license.\n\nIf you have any questions, feel free to reply to this email.\n\nBest regards,\nFahd Ali\nCEO & Founder, LidOrbit`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="cid:lidorbit_logo.png" alt="LidOrbit Logo" style="max-width: 130px; height: auto; display: inline-block;">
      </div>
      <h2 style="color: #6366f1; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px; margin-top: 0; text-align: center;">Welcome to LidOrbit!</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>Thank you for purchasing LidOrbit! Your lifetime license has been created and is ready for use.</p>
      
      <div style="background-color: #f9fafb; padding: 18px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
        <p style="margin-top: 0; font-style: italic; color: #4b5563; font-size: 14px; line-height: 1.6;">
          "LidOrbit was born out of real-world developer frustration. Picture this: I was sitting at a local coffee shop, sipping coffee, racing to hit a tight deadline. Suddenly, the shop became incredibly loud, and the staff announced they were about to close. I had no choice but to pack up. 
          <br><br>
          But closing my laptop's lid meant interrupting my active code compilation and stopping the AI agents running in my background. That frustration led to the idea for LidOrbit. 
          <br><br>
          Now, you can simply close your laptop lid, seek a quieter workspace, and keep your compilation or AI agents running without interruption. Plus, we've integrated a battery monitor that alerts you when your battery drops below 10%, ensuring your machine stays safe. It's a win-win."
        </p>
        <p style="margin-bottom: 0; font-weight: bold; color: #6366f1; text-align: right; font-size: 13px;">— Fahd Ali, CEO & Founder</p>
      </div>

      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px dashed #d1d5db;">
        <h3 style="margin-top: 0; color: #374151; font-size: 15px;">Your Account Details:</h3>
        <ul style="list-style-type: none; padding-left: 0; margin-bottom: 0; font-size: 14px;">
          <li style="margin-bottom: 6px;"><strong>Username:</strong> ${username}</li>
          <li><strong>License Key:</strong> <code style="font-family: monospace; font-size: 13px; background: #e5e7eb; padding: 2px 6px; border-radius: 4px; color: #111827;">${licenseKey}</code></li>
        </ul>
      </div>

      <h3 style="color: #374151; font-size: 15px; margin-top: 20px;">How to Activate:</h3>
      <ol style="padding-left: 20px; font-size: 14px; color: #4b5563;">
        <li style="margin-bottom: 6px;">Open the <strong>LidOrbit</strong> app on your computer.</li>
        <li>Enter your username or email and the password you created to log in and authorize the device.</li>
      </ol>

      <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; color: #b45309; font-size: 13px; border-radius: 4px; margin-top: 20px;">
        <strong>Device Limit Lock:</strong> Your account is locked to a single device. Once logged in, this account cannot be used on another computer. To use another computer, you must purchase a separate license.
      </p>
      <p style="margin-top: 20px; border-top: 1px solid #f3f4f6; padding-top: 15px; font-size: 13px; color: #9ca3af; text-align: center;">
        Best regards,<br><strong style="color: #4b5563;">The LidOrbit Team</strong>
      </p>
    </div>
  `;

  return sendEmailViaBrevo(toEmail, username, subject, textContent, htmlContent);
}

/**
 * Sends a password reset email containing credentials and a verification reset link.
 */
async function sendPasswordResetEmail(toEmail, username, licenseKey, resetLink) {
  const subject = 'Reset your LidOrbit password';
  
  const textContent = `Hello ${username},\n\nWe received a request to reset your password for your LidOrbit account.\n\nYour account credentials:\n- Username: ${username}\n- License Key: ${licenseKey}\n\nPlease reset your password using the link below (expires in 1 hour):\n\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.\n\nBest regards,\nThe LidOrbit Team`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="cid:lidorbit_logo.png" alt="LidOrbit Logo" style="max-width: 130px; height: auto; display: inline-block;">
      </div>
      <h2 style="color: #6366f1; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px; margin-top: 0; text-align: center;">Reset Password & Credentials</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>We received a request to reset your password for your LidOrbit account.</p>
      
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px dashed #e5e7eb;">
        <h3 style="margin-top: 0; color: #4b5563; font-size: 14px;">Account Details:</h3>
        <ul style="list-style-type: none; padding-left: 0; margin-bottom: 0; font-size: 14px;">
          <li style="margin-bottom: 6px;"><strong>Username:</strong> ${username}</li>
          <li><strong>License Key:</strong> <code style="font-family: monospace; font-size: 13px; background: #e5e7eb; padding: 2px 6px; border-radius: 4px; color: #111827;">${licenseKey}</code></li>
        </ul>
      </div>

      <p>Please click the button below to choose a new password (expires in 1 hour):</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.25);">Reset Password</a>
      </div>
      <p style="font-size: 12px; color: #6b7280; word-break: break-all;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${resetLink}" style="color: #6366f1;">${resetLink}</a>
      </p>
      <p>If you did not request this, you can safely ignore this email.</p>
      <p style="margin-top: 20px; border-top: 1px solid #f3f4f6; padding-top: 15px; font-size: 13px; color: #9ca3af; text-align: center;">
        Best regards,<br><strong style="color: #4b5563;">The LidOrbit Team</strong>
      </p>
    </div>
  `;

  return sendEmailViaBrevo(toEmail, username, subject, textContent, htmlContent);
}

/**
 * Sends a confirmation email to the user after their password has been successfully reset.
 */
async function sendPasswordResetConfirmationEmail(toEmail, username) {
  const subject = 'Your LidOrbit password has been successfully reset';
  
  const textContent = `Hello ${username},\n\nThis is a confirmation that the password for your LidOrbit account was successfully changed.\n\nIf you did not request this change, please contact us immediately at fahdzk@gmail.com.\n\nBest regards,\nThe LidOrbit Team`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="cid:lidorbit_logo.png" alt="LidOrbit Logo" style="max-width: 130px; height: auto; display: inline-block;">
      </div>
      <h2 style="color: #6366f1; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px; margin-top: 0; text-align: center;">Password Reset Successful</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>This is a confirmation that the password for your LidOrbit account was successfully changed.</p>
      <p style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; color: #b45309; font-size: 13px; border-radius: 4px; margin-top: 20px;">
        <strong>Security Warning:</strong> If you did not make this change, please contact us immediately by replying to this email or writing to fahdzk@gmail.com.
      </p>
      <p style="margin-top: 20px; border-top: 1px solid #f3f4f6; padding-top: 15px; font-size: 13px; color: #9ca3af; text-align: center;">
        Best regards,<br><strong style="color: #4b5563;">The LidOrbit Team</strong>
      </p>
    </div>
  `;

  return sendEmailViaBrevo(toEmail, username, subject, textContent, htmlContent);
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail
};
