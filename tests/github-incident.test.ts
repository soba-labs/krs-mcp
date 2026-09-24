import { describe, expect, it, vi } from "vitest";
import { reportLiveIncident } from "../src/ops/github-incident.js";
import type { HealthCheckResult } from "../src/health-check.js";

const context = {
  repository: "soba-labs/krs-mcp",
  runUrl: "https://github.com/soba-labs/krs-mcp/actions/runs/123",
  token: "test-token",
};

function health(overrides: Partial<HealthCheckResult> = {}): HealthCheckResult {
  return {
    status: "search-contract-change",
    actionable: true,
    summary: "The search response changed.",
    checkedAt: "2026-09-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("reportLiveIncident", () => {
  it("does not create an issue for a transient failure", async () => {
    const fetchImpl = vi.fn();

    const outcome = await reportLiveIncident(
      health({ status: "upstream-unavailable", actionable: false }),
      context,
      fetchImpl as unknown as typeof fetch,
    );

    expect(outcome).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("comments on the existing open incident instead of creating a duplicate", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ number: 42, title: "KRS search compatibility needs human review" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));

    const outcome = await reportLiveIncident(health(), context, fetchImpl as typeof fetch);

    expect(outcome).toBe("commented");
    expect(fetchImpl.mock.calls[1][0]).toContain("/issues/42/comments");
  });

  it("creates one incident when no matching open issue exists", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));

    const outcome = await reportLiveIncident(health(), context, fetchImpl as typeof fetch);
    const createRequest = fetchImpl.mock.calls[1];
    const body = JSON.parse((createRequest[1] as RequestInit).body as string);

    expect(outcome).toBe("created");
    expect(createRequest[0]).toContain("/repos/soba-labs/krs-mcp/issues");
    expect(body).toMatchObject({
      title: "KRS search compatibility needs human review",
      labels: ["bug"],
    });
    expect(body.body).toContain(context.runUrl);
    expect(body.body).toContain("Do not bypass new access controls automatically.");
  });
});
