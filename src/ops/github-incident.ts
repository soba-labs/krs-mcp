import type { HealthCheckResult } from "../health-check.js";

export const INCIDENT_TITLE = "KRS search compatibility needs human review";

export interface IncidentContext {
  repository: string;
  runUrl: string;
  token: string;
  apiUrl?: string;
}

export type IncidentOutcome = "skipped" | "created" | "commented";

interface GitHubIssue {
  number: number;
  title: string;
  pull_request?: unknown;
}

function repositoryPath(repository: string): string {
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error("GitHub repository must use the owner/name format");
  }

  return parts.map(encodeURIComponent).join("/");
}

async function githubRequest(
  url: string,
  token: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return response;
}

function incidentBody(result: HealthCheckResult, runUrl: string): string {
  return [
    result.summary,
    "",
    `Status: \`${result.status}\``,
    `Checked at: ${result.checkedAt}`,
    `Workflow run: ${runUrl}`,
    "",
    "Do not bypass new access controls automatically.",
  ].join("\n");
}

export async function reportLiveIncident(
  result: HealthCheckResult,
  context: IncidentContext,
  fetchImpl: typeof fetch = fetch,
): Promise<IncidentOutcome> {
  if (!result.actionable) {
    return "skipped";
  }

  const apiUrl = context.apiUrl ?? "https://api.github.com";
  const repoPath = repositoryPath(context.repository);
  const issuesUrl = `${apiUrl}/repos/${repoPath}/issues`;
  const listResponse = await githubRequest(
    `${issuesUrl}?state=open&labels=bug&per_page=100`,
    context.token,
    { method: "GET" },
    fetchImpl,
  );
  const issues = (await listResponse.json()) as GitHubIssue[];
  const existing = issues.find(
    (issue) => issue.title === INCIDENT_TITLE && issue.pull_request === undefined,
  );
  const body = incidentBody(result, context.runUrl);

  if (existing) {
    await githubRequest(
      `${issuesUrl}/${existing.number}/comments`,
      context.token,
      { method: "POST", body: JSON.stringify({ body }) },
      fetchImpl,
    );
    return "commented";
  }

  await githubRequest(
    issuesUrl,
    context.token,
    {
      method: "POST",
      body: JSON.stringify({ title: INCIDENT_TITLE, labels: ["bug"], body }),
    },
    fetchImpl,
  );
  return "created";
}
