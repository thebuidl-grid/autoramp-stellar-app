import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface UserLimitConfig {
  maxAmount: number | null;
  note?: string;
}

interface UserLimitsFile {
  defaultMaxAmount: number;
  minAmount: number;
  users: Record<string, UserLimitConfig>;
}

@Injectable()
export class UserLimitsService {
  private readonly logger = new Logger(UserLimitsService.name);
  private config: UserLimitsFile;
  private readonly configPath = path.join(
    __dirname,
    '../../config/user-limits.json',
  );

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(raw);
      this.logger.log('User limits config loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load user limits config, using defaults');
      this.config = {
        defaultMaxAmount: 500000,
        minAmount: 2000,
        users: {},
      };
    }
  }

  getMaxAmount(email: string): number | null {
    const userLimit = this.config.users[email];
    if (userLimit) {
      return userLimit.maxAmount;
    }
    return this.config.defaultMaxAmount;
  }

  getMinAmount(): number {
    return this.config.minAmount;
  }

  isUnlimited(email: string): boolean {
    const userLimit = this.config.users[email];
    return userLimit?.maxAmount === null;
  }

  validateAmount(email: string, amount: number): void {
    const min = this.getMinAmount();
    if (amount < min) {
      throw new Error(`Amount must be at least ${min} NGN`);
    }

    const max = this.getMaxAmount(email);
    if (max !== null && amount > max) {
      throw new Error(
        `Amount must not exceed ${max.toLocaleString()} NGN for this user`,
      );
    }
  }

  reloadConfig(): void {
    this.loadConfig();
  }
}
