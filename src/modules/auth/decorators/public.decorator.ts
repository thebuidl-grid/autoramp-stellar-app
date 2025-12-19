import { SetMetadata } from '@nestjs/common';

/**
 * Public Decorator
 * 
 * Marks a route as public, allowing access without authentication.
 * Use this decorator on routes that should be accessible without JWT token.
 */
export const Public = () => SetMetadata('isPublic', true);

