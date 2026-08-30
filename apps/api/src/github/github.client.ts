// =============================================================================
// ForgeMind API — GitHub API Client
// =============================================================================

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GithubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  updated_at: string;
  created_at: string;
  pushed_at: string;
}

export interface GithubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author?: {
      name: string;
      email: string;
      date: string;
    };
  };
}

export interface GithubTreeResponse {
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    type: 'blob' | 'tree' | string;
    sha: string;
    size?: number;
    url?: string;
  }>;
  truncated: boolean;
}

export interface GithubFileContentResponse {
  type: string;
  encoding?: string;
  size: number;
  name: string;
  path: string;
  content?: string;
  sha: string;
}

export type GithubStatusState = 'pending' | 'success' | 'failure' | 'error';

export interface PostCommitStatusOptions {
  state: GithubStatusState;
  context?: string;
  description?: string;
  target_url?: string;
}

export interface GithubCommitStatus {
  id: number;
  state: GithubStatusState;
  description: string | null;
  target_url: string | null;
  context: string;
  created_at: string;
}

export interface GithubIssueComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
}

export interface GithubClient {
  getAuthenticatedUser(): Promise<GithubUser>;
  listRepositories(): Promise<GithubRepository[]>;
  getRepository(owner: string, repo: string): Promise<GithubRepository>;
  listBranches(owner: string, repo: string): Promise<GithubBranch[]>;
  getDefaultBranch(owner: string, repo: string): Promise<string>;
  getCommit(owner: string, repo: string, ref?: string): Promise<GithubCommit>;
  getTree(
    owner: string,
    repo: string,
    treeSha: string,
    recursive?: boolean,
  ): Promise<GithubTreeResponse>;
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string>;
  postCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    options: PostCommitStatusOptions,
  ): Promise<GithubCommitStatus>;
  listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GithubIssueComment[]>;
  createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<GithubIssueComment>;
  updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<GithubIssueComment>;
}

const GITHUB_BASE_URL = 'https://api.github.com';

/**
 * Creates a reusable GitHub REST API client using fetch.
 *
 * @param token Optional GitHub personal access token or OAuth token.
 */
export function createGithubClient(token?: string): GithubClient {
  /**
   * Centralized private helper to send HTTP requests to GitHub REST API.
   */
  async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${GITHUB_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ForgeMind',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] =
        token.startsWith('Bearer ') || token.startsWith('token ') ? token : `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async function getAuthenticatedUser(): Promise<GithubUser> {
    return request<GithubUser>('/user');
  }

  async function listRepositories(): Promise<GithubRepository[]> {
    return request<GithubRepository[]>('/user/repos?sort=updated&per_page=100&type=owner');
  }

  async function getRepository(owner: string, repo: string): Promise<GithubRepository> {
    return request<GithubRepository>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    );
  }

  async function listBranches(owner: string, repo: string): Promise<GithubBranch[]> {
    return request<GithubBranch[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    );
  }

  async function getDefaultBranch(owner: string, repo: string): Promise<string> {
    const repository = await getRepository(owner, repo);
    return repository.default_branch;
  }

  async function getCommit(owner: string, repo: string, ref = 'HEAD'): Promise<GithubCommit> {
    return request<GithubCommit>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,
    );
  }

  async function getTree(
    owner: string,
    repo: string,
    treeSha: string,
    recursive = true,
  ): Promise<GithubTreeResponse> {
    const query = recursive ? '?recursive=1' : '';
    return request<GithubTreeResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}${query}`,
    );
  }

  async function getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref = 'HEAD',
  ): Promise<string> {
    const encodedPath = path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const res = await request<GithubFileContentResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    );

    if (res.content && res.encoding === 'base64') {
      return Buffer.from(res.content.replace(/\n/g, ''), 'base64').toString('utf-8');
    }
    return '';
  }

  async function postCommitStatus(
    owner: string,
    repo: string,
    sha: string,
    statusOptions: PostCommitStatusOptions,
  ): Promise<GithubCommitStatus> {
    return request<GithubCommitStatus>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/statuses/${encodeURIComponent(sha)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: statusOptions.state,
          context: statusOptions.context ?? 'forgemind/architecture-gatekeeper',
          description: statusOptions.description,
          target_url: statusOptions.target_url,
        }),
      },
    );
  }

  async function listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GithubIssueComment[]> {
    return request<GithubIssueComment[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?per_page=100`,
    );
  }

  async function createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<GithubIssueComment> {
    return request<GithubIssueComment>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      },
    );
  }

  async function updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<GithubIssueComment> {
    return request<GithubIssueComment>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      },
    );
  }

  return {
    getAuthenticatedUser,
    listRepositories,
    getRepository,
    listBranches,
    getDefaultBranch,
    getCommit,
    getTree,
    getFileContent,
    postCommitStatus,
    listIssueComments,
    createIssueComment,
    updateIssueComment,
  };
}
