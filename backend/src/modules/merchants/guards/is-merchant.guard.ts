import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class IsMerchantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Admin bypass
    if (user.role === 'ADMIN') {
      return true;
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      throw new ForbiddenException('Merchant user not found');
    }

    if (!dbUser.isMerchant) {
      throw new ForbiddenException('Merchant access required');
    }

    if (dbUser.suspended) {
      throw new ForbiddenException('Your account has been suspended');
    }

    return true;
  }
}
