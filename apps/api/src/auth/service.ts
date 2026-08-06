// =============================================================================
// ForgeMind API — Auth & User Profile Service
// =============================================================================

import { PrismaClient, type User } from '@prisma/client';

const prisma = new PrismaClient();

export interface UserProfileData {
  id?: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

/**
 * Ensures a user profile exists in the database.
 * Auto-creates the user profile on first login without creating duplicates.
 */
export async function ensureUserProfile(data: UserProfileData): Promise<User> {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [...(data.id ? [{ id: data.id }] : []), { email: data.email }],
    },
  });

  if (existingUser) {
    // Return existing user without duplicating
    return existingUser;
  }

  // Create user profile on first login
  return prisma.user.create({
    data: {
      ...(data.id ? { id: data.id } : {}),
      email: data.email,
      name: data.name || null,
      avatarUrl: data.avatarUrl || null,
    },
  });
}

/**
 * Finds a user profile by ID.
 */
export async function getUserProfileById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}
