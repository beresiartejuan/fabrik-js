import { z } from 'zod';

/**
 * DTOs de auth validados con zod (Fase 3). Mismo patrón que la Fase 2: el schema
 * es la única fuente del tipo (`z.infer`) y se valida con `ZodValidationPipe`.
 */

/** `POST /auth/login`: login por nombre de worker + contraseña. */
export const LoginSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});
export type LoginDto = z.infer<typeof LoginSchema>;

/** `POST /auth/refresh`: token de refresco vigente. */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'El refresh token es obligatorio'),
});
export type RefreshDto = z.infer<typeof RefreshSchema>;
