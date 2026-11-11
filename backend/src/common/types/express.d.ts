import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      // `user` can be a full User (authenticated JWT) or a lightweight merchant identity
      user?: any;
      apiKey?: string;
      merchantApiKey?: string;
    }
  }
}
