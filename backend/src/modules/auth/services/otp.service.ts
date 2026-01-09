import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { Resend } from 'resend';

/**
 * OTP Service
 * 
 * Handles OTP generation, sending via email (Resend), and verification.
 */
@Injectable()
export class OtpService {
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required in environment variables');
    }
    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  }

  /**
   * Generate a 6-digit OTP code
   */
  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send OTP to email
   * 
   * @param email - Email address to send OTP to
   * @param purpose - Purpose of OTP (default: SIGNUP)
   * @returns OTP code (for testing, in production this should not be returned)
   */
  async sendOtp(email: string, purpose: string = 'SIGNUP'): Promise<{ success: boolean; message: string }> {
    // Check for existing unused OTP within last minute (rate limiting)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentOtp = await this.prisma.otp.findFirst({
      where: {
        email,
        purpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
        createdAt: { gte: oneMinuteAgo },
      },
    });

    if (recentOtp) {
      throw new BadRequestException('Please wait before requesting a new OTP code');
    }

    // Generate OTP
    const code = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Invalidate all previous unused OTPs for this email and purpose
    await this.prisma.otp.updateMany({
      where: {
        email,
        purpose,
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // Save OTP to database
    await this.prisma.otp.create({
      data: {
        email,
        code,
        purpose,
        expiresAt,
      },
    });

    // Send email via Resend
    try {
      const subject = purpose === 'SIGNUP' 
        ? 'Verify your email address - AutoRamp'
        : 'Your verification code - AutoRamp';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verification</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">AutoRamp</h1>
            </div>
            <div style="background-color: #f9f9f9; padding: 30px; margin-top: 20px;">
              <h2 style="color: #000; margin-top: 0;">Email Verification</h2>
              <p>Your verification code is:</p>
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

      await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject,
        html: htmlContent,
      });

      return {
        success: true,
        message: 'OTP sent successfully to your email',
      };
    } catch (error: any) {
      // Delete the OTP if email sending fails
      await this.prisma.otp.deleteMany({
        where: { email, code, purpose },
      });

      throw new BadRequestException(
        `Failed to send OTP email: ${error.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Verify OTP code
   * 
   * @param email - Email address
   * @param code - OTP code to verify
   * @param purpose - Purpose of OTP (default: SIGNUP)
   * @returns true if valid, throws error if invalid
   */
  async verifyOtp(email: string, code: string, purpose: string = 'SIGNUP'): Promise<boolean> {
    const otp = await this.prisma.otp.findFirst({
      where: {
        email,
        code,
        purpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Mark OTP as used
    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });

    return true;
  }

  /**
   * Clean up expired OTPs (can be called by a cron job)
   */
  async cleanupExpiredOtps(): Promise<number> {
    const result = await this.prisma.otp.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    return result.count;
  }
}

