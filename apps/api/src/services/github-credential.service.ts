// =============================================================================
// ForgeMind API — GitHub Credential Management Service
// =============================================================================

import { PrismaClient } from '@prisma/client';

import { createGithubClient } from '../github/index.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';

const prisma = new PrismaClient();

export interface GitHubConnectionStatus {
  connected: boolean;
  githubUsername: string | null;
  githubAvatarUrl: string | null;
  updatedAt: Date | null;
}

/**
 * Validates a GitHub Personal Access Token, encrypts it, and saves it in the database.
 * Never logs or exposes raw token string.
 */
export async function saveGitHubCredential(
  userId: string,
  token: string,
): Promise<GitHubConnectionStatus> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new Error('GitHub token must not be empty.');
  }

  // 1. Validate token against GitHub API
  const github = createGithubClient(trimmedToken);
  let ghUser;
  try {
    ghUser = await github.getAuthenticatedUser();
  } catch {
    throw new Error('Invalid or expired GitHub Personal Access Token.');
  }

  if (!ghUser || !ghUser.login) {
    throw new Error('Could not verify GitHub user account with provided token.');
  }

  // 2. Encrypt token for storage at rest
  const encryptedToken = encryptToken(trimmedToken);

  // 3. Upsert credential into database
  const credential = await prisma.userGitHubCredential.upsert({
    where: { userId },
    create: {
      userId,
      encryptedToken,
      githubUsername: ghUser.login,
      githubAvatarUrl: ghUser.avatar_url,
    },
    update: {
      encryptedToken,
      githubUsername: ghUser.login,
      githubAvatarUrl: ghUser.avatar_url,
    },
  });

  return {
    connected: true,
    githubUsername: credential.githubUsername,
    githubAvatarUrl: credential.githubAvatarUrl,
    updatedAt: credential.updatedAt,
  };
}

/**
 * Returns connection status and public GitHub metadata for a user.
 * Never returns the decrypted or encrypted token string.
 */
export async function getGitHubCredentialStatus(userId: string): Promise<GitHubConnectionStatus> {
  const credential = await prisma.userGitHubCredential.findUnique({
    where: { userId },
  });

  if (!credential) {
    return {
      connected: false,
      githubUsername: null,
      githubAvatarUrl: null,
      updatedAt: null,
    };
  }

  return {
    connected: true,
    githubUsername: credential.githubUsername,
    githubAvatarUrl: credential.githubAvatarUrl,
    updatedAt: credential.updatedAt,
  };
}

/**
 * Server-side internal helper to retrieve decrypted GitHub token for authorized jobs.
 * Never expose this function directly in controllers or HTTP responses.
 */
export async function getDecryptedGitHubToken(userId: string): Promise<string | null> {
  const credential = await prisma.userGitHubCredential.findUnique({
    where: { userId },
  });

  if (!credential || !credential.encryptedToken) {
    return null;
  }

  try {
    return decryptToken(credential.encryptedToken);
  } catch {
    return null;
  }
}

/**
 * Deletes / disconnects the user's stored GitHub credential.
 */
export async function deleteGitHubCredential(userId: string): Promise<{ success: boolean }> {
  await prisma.userGitHubCredential.deleteMany({
    where: { userId },
  });

  return { success: true };
}
