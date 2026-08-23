// =============================================================================
// ForgeMind API — Auth & User Profile Service
// =============================================================================

import { prisma } from '../lib/prisma.js';

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
export async function ensureUserProfile(data: UserProfileData) {
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
export async function getUserProfileById(id: string) {
  return prisma.user.findUnique({
    where: { id },
  });
}
