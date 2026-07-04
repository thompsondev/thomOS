import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a controller or route handler as publicly accessible (bypasses JWT + API key guards). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
