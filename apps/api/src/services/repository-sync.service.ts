// =============================================================================
// ForgeMind API — Repository Sync Service
// =============================================================================

import { createGithubClient } from '../github/index.js';
import {
  createRepository,
  findRepositoryByGithubId,
  repositoryExists,
  updateRepository,
} from './repository.service.js';

// ─── Result Type ─────────────────────────────────────────────────────────────

export interface SyncResult {
  total: number;
  created: number;
  updated: number;
}

// ─── Sync Logic ───────────────────────────────────────────────────────────────

/**
 * Synchronises GitHub repositories for a given user into the local database.
 *
 * Fetches repositories from the GitHub API and upserts each one:
 *   - Creates a new record if it does not exist.
 *   - Updates the existing record if it does.
 *
 * Never deletes repositories. Never creates duplicates.
 * Bubbles any GitHub API errors without swallowing them.
 *
 * @param userId      The ForgeMind database user ID that owns the repositories.
 * @param githubToken A valid GitHub OAuth / personal access token.
 * @returns A SyncResult summarising the operation.
 */
export async function syncRepositories(userId: string, githubToken: string): Promise<SyncResult> {
  const github = createGithubClient(githubToken);

  // 1. Fetch authenticated GitHub user (validates token & retrieves profile)
  await github.getAuthenticatedUser();

  // 2. Fetch all owner repositories
  const githubRepos = await github.listRepositories();

  const result: SyncResult = {
    total: githubRepos.length,
    created: 0,
    updated: 0,
  };

  // 3. Upsert each repository
  for (const repo of githubRepos) {
    const exists = await repositoryExists(repo.id);

    if (exists) {
      // Retrieve existing record to obtain its database primary key
      const existing = await findRepositoryByGithubId(repo.id);

      if (existing) {
        await updateRepository(existing.id, {
          name: repo.name,
          fullName: repo.full_name,
          owner: repo.owner.login,
          private: repo.private,
          defaultBranch: repo.default_branch,
          language: repo.language ?? null,
          description: repo.description ?? null,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          htmlUrl: repo.html_url,
        });
        result.updated += 1;
      }
    } else {
      await createRepository({
        userId,
        githubId: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        defaultBranch: repo.default_branch,
        language: repo.language ?? null,
        description: repo.description ?? null,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        htmlUrl: repo.html_url,
      });
      result.created += 1;
    }
  }

  return result;
}
