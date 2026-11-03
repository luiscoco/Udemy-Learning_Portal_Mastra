import { z } from 'zod';

/** POST /api/auth/login body (development login). */
export const LoginRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{1,64}$/, 'Use 1–64 lowercase letters, digits, dot, dash or underscore'),
  password: z.string().max(200).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PrincipalSchema = z.object({ sub: z.string().max(120), name: z.string().max(120), provider: z.string().max(40) });
export type PrincipalView = z.infer<typeof PrincipalSchema>;

/** GET /api/auth/session (and the login response). Never contains the session value itself. */
export const SessionResponseSchema = z.object({
  authenticated: z.boolean(),
  principal: PrincipalSchema.nullable(),
  provider: z.string().max(40),
  login: z.object({ kind: z.enum(['dev', 'password']), passwordRequired: z.boolean() }),
  expiresAt: z.string().max(40).nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
