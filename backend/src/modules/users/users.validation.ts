import { z } from 'zod';
import { ModuleName, Role, UserStatus } from '@prisma/client';

const permissionRowSchema = z.object({
  module: z.nativeEnum(ModuleName),
  canView: z.boolean().default(false),
  canAdd: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canApprove: z.boolean().default(false),
});

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'Password must include upper, lower, number and special character',
  });

export const createUserSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, 'Full name is required'),
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      mobile: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Enter a valid mobile number'),
      password: passwordRule,
      confirmPassword: z.string(),
      role: z.nativeEnum(Role),
      status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
      projectIds: z.array(z.string().uuid()).default([]),
      permissions: z.array(permissionRowSchema).default([]),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
});

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).optional(),
    mobile: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid mobile number')
      .optional(),
    role: z.nativeEnum(Role).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    projectIds: z.array(z.string().uuid()).optional(),
    permissions: z.array(permissionRowSchema).optional(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    newPassword: passwordRule,
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
