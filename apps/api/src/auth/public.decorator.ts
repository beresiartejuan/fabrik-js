import { SetMetadata } from '@nestjs/common';

/**
 * Marca un handler (o controlador) como público: el `ActorGuard` global lo deja
 * pasar sin exigir `Authorization: Bearer <access token>`. Se usa en
 * `GET /health`, `POST /auth/login` y `POST /auth/refresh`.
 */
export const IS_PUBLIC_KEY = 'fabrik:isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
