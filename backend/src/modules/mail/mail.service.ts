import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required in environment variables');
    }
    this.resend = new Resend(apiKey);
    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'onboarding@resend.dev';
  }

  async sendMerchantStatusUpdateEmail(
    to: string,
    merchantName: string,
    status: string,
    loginLink: string,
    rejectionReason?: string,
  ) {
    let subject: string;
    let htmlContent: string;

    switch (status) {
      case 'APPROVED':
      case 'VERIFIED':
        subject = `Your AutoRamp Merchant Account is ${status}`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Account ${status}</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">AutoRamp</h1>
              </div>
              <div style="background-color: #f9f9f9; padding: 30px; margin-top: 20px;">
                <h2 style="color: #000; margin-top: 0;">Dear ${merchantName},</h2>
                <p>Good news! Your merchant account with AutoRamp has been <strong>${status}</strong>.</p>
                <p>You can now log in and start using our services.</p>
                <p>Click here to log in: <a href="${loginLink}">${loginLink}</a></p>
              </div>
              <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                <p>&copy; ${new Date().getFullYear()} AutoRamp. All rights reserved.</p>
              </div>
            </body>
          </html>
        `;
        break;
      case 'REJECTED':
        subject = `Update Regarding Your AutoRamp Merchant Account Application`;
        htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Account Rejected</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">AutoRamp</h1>
              </div>
              <div style="background-color: #f9f9f9; padding: 30px; margin-top: 20px;">
                <h2 style="color: #000; margin-top: 0;">Dear ${merchantName},</h2>
                <p>We regret to inform you that your merchant account application with AutoRamp has been <strong>REJECTED</strong>.</p>
                ${rejectionReason ? `<p>Reason: ${rejectionReason}</p>` : ''}
                <p>If you have any questions, please contact our support team.</p>
              </div>
              <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                <p>&copy; ${new Date().getFullYear()} AutoRamp. All rights reserved.</p>
              </div>
            </body>
          </html>
        `;
        break;
      default:
        // For other statuses, no email or a generic one if needed.
        console.warn(`No specific email template for status: ${status}`);
        return;
    }

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: to,
        subject: subject,
        html: htmlContent,
      });
      console.log(
        `Merchant status update email sent to ${to} for status: ${status}`,
      );
    } catch (error) {
      console.error(
        `Failed to send merchant status update email to ${to}:`,
        error,
      );
    }
  }

  async sendBankAccountVerificationEmail(to: string, code: string) {
    const subject = 'Verify your Bank Account addition - AutoRamp';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bank Account Verification</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">AutoRamp</h1>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; margin-top: 20px;">
            <h2 style="color: #000; margin-top: 0;">Bank Account Verification</h2>
            <p>You are adding a new bank account to your AutoRamp merchant profile.</p>
            <p>Please use the following verification code to confirm this action:</p>
            <div style="background-color: #000; color: #fff; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} AutoRamp. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: to,
        subject: subject,
        html: htmlContent,
      });
      console.log(`Bank account verification email sent to ${to}`);
    } catch (error) {
      console.error(
        `Failed to send bank account verification email to ${to}:`,
        error,
      );
    }
  }

  async sendOtcEnablementEmail(to: string, contactName: string) {
    const subject = 'Your AutoRamp OTC Access is Enabled';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>OTC Access Enabled</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">AutoRamp</h1>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; margin-top: 20px;">
            <h2 style="color: #000; margin-top: 0;">Dear ${contactName},</h2>
            <p>We are pleased to inform you that your <strong>OTC (Over-The-Counter)</strong> access has been enabled on AutoRamp.</p>
            <p>You can now perform large volume transactions through our OTC desk.</p>
            <p>Log in to your dashboard to get started.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} AutoRamp. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: to,
        subject: subject,
        html: htmlContent,
      });
      console.log(`OTC enablement email sent to ${to}`);
    } catch (error) {
      console.error(`Failed to send OTC enablement email to ${to}:`, error);
    }
  }

  async sendOtcInflowNotification(data: {
    userEmail: string;
    userName: string;
    transactionId: string;
    reference: string;
    amountReceived: number;
    token: string;
    quantity: number;
    rate: number;
    network: string;
    walletAddress: string;
  }) {
    const subject = `[OTC] Inflow Received — ${data.reference}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>OTC Inflow Notification</title></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">AutoRamp OTC</h1>
            <p style="margin: 5px 0 0; color: #aaa; font-size: 14px;">Inflow Received — Action Required</p>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; margin-top: 20px;">
            <h2 style="color: #000; margin-top: 0;">New OTC Transfer Received</h2>
            <p>An OTC user has made a transfer. Please process this transaction promptly.</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Transaction ID</td>
                <td style="padding: 10px 0;">${data.transactionId}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Reference</td>
                <td style="padding: 10px 0;">${data.reference}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">User Email</td>
                <td style="padding: 10px 0;">${data.userEmail}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">User Name</td>
                <td style="padding: 10px 0;">${data.userName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">NGN Received</td>
                <td style="padding: 10px 0; font-size: 18px; color: #000;"><strong>₦${Number(data.amountReceived).toLocaleString()}</strong></td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Token to Send</td>
                <td style="padding: 10px 0;"><strong>${data.quantity} ${data.token}</strong></td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Rate Used</td>
                <td style="padding: 10px 0;">₦${data.rate} / ${data.token}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Network</td>
                <td style="padding: 10px 0;">${data.network}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #666;">Wallet Address</td>
                <td style="padding: 10px 0; font-family: monospace; word-break: break-all;">${data.walletAddress}</td>
              </tr>
            </table>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} AutoRamp. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: 'dave.dapp.testing@gmail.com',
        subject: subject,
        html: htmlContent,
      });
    } catch (error) {
      console.error(`Failed to send OTC inflow notification:`, error);
    }
  }
}
