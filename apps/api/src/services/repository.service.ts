// =============================================================================
// ForgeMind API — Repository Service Layer
// =============================================================================

import type { Repository } from '@prisma/client';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export type CreateRepositoryData = Prisma.RepositoryUncheckedCreateInput;
export type UpdateRepositoryData = Prisma.RepositoryUncheckedUpdateInput;

/**
 * Creates a new repository record in the database.
 */
export async function createRepository(data: CreateRepositoryData): Promise<Repository> {
  return prisma.repository.create({
    data,
  });
}

/**
 * Finds a repository by its database unique ID.
 */
export async function findRepositoryById(id: string): Promise<Repository | null> {
  return prisma.repository.findUnique({
    where: { id },
  });
}

/**
 * Verifies repository existence and user ownership.
 * Throws a descriptive error if verification fails.
 */
export async function assertRepositoryOwnership(
  repositoryId: string,
  userId: string,
): Promise<void> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }
  if (repo.userId !== userId) {
    throw new Error(`Access denied for repository: ${repositoryId}`);
  }
}

/**
 * Finds a repository by its unique GitHub ID.
 */
export async function findRepositoryByGithubId(githubId: number): Promise<Repository | null> {
  return prisma.repository.findUnique({
    where: { githubId },
  });
}

/**
 * Finds all repositories owned by a given user ID.
 */
export async function findRepositoriesByUser(userId: string): Promise<Repository[]> {
  return prisma.repository.findMany({
    where: { userId },
  });
}

/**
 * Updates a repository record by ID.
 * Returns the updated record, or null if the repository does not exist.
 */
export async function updateRepository(
  id: string,
  data: UpdateRepositoryData,
): Promise<Repository | null> {
  try {
    return await prisma.repository.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return null;
    }
    throw error;
  }
}

/**
 * Deletes a repository record by ID.
 * Returns the deleted record, or null if the repository does not exist.
 */
export async function deleteRepository(id: string): Promise<Repository | null> {
  try {
    return await prisma.repository.delete({
      where: { id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return null;
    }
    throw error;
  }
}

/**
 * Checks if a repository with the given GitHub ID exists in the database.
 */
export async function repositoryExists(githubId: number): Promise<boolean> {
  const repo = await prisma.repository.findUnique({
    where: { githubId },
    select: { id: true },
  });
  return repo !== null;
}

/**
 * Counts the total number of repositories owned by a given user ID.
 */
export async function countRepositories(userId: string): Promise<number> {
  return prisma.repository.count({
    where: { userId },
  });
}
