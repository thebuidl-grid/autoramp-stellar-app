import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AnalyticsGuard implements CanActivate {
  private readonly allowedEmails: string[];

  constructor() {
    const envEmails = process.env.ALLOWED_ADMIN_EMAILS
      ? process.env.ALLOWED_ADMIN_EMAILS.split(',').map((e) => e.trim())
      : [];

    const filePath = path.join(__dirname, 'allowed-emails.json');
    let fileEmails: string[] = [];
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      fileEmails = JSON.parse(data);
    } catch {
      fileEmails = [];
    }

    this.allowedEmails = [...new Set([...envEmails, ...fileEmails])];
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = request.headers['x-admin-email'];

    if (!email) {
      throw new UnauthorizedException('Missing x-admin-email header');
    }

    if (!this.allowedEmails.includes(email)) {
      throw new UnauthorizedException('Email not authorized');
    }

    return true;
  }
}
