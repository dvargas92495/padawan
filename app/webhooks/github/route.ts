import crypto from "crypto";
import type { WebhookEvent } from "@octokit/webhooks-types";
import getInstallationToken from "src/utils/getInstallationToken";
import { v4 } from "uuid";
import { Octokit } from "@octokit/rest";

export const POST = async (request: Request) => {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error(`Missing Webhook Secret`);
  if (typeof request.body !== "string") throw new Error(`Invalid Body`);
  const computed = crypto
    .createHash("sha256")
    .update(webhookSecret)
    .update(request.body)
    .digest("hex");
  const actual = (request.headers.get("X-Hub-Signature-256") || "").replace(
    "sha256=",
    ""
  );
  console.log("compare hashes", computed, actual);
  // TODO - if invalid, return 40X

  const event = JSON.parse(request.body) as WebhookEvent;
  const response = new Response(JSON.stringify({ success: true }), {
    status: 200,
  });
  if (!("action" in event)) return response;
  if (event.action === "labeled" && "issue" in event) {
    const auth = await getInstallationToken(
      event.sender.type,
      event.sender.login
    );
    const octokit = new Octokit({
      auth,
    });
    if (event.label?.name === "padawan") {
      const missionUuid = v4();
      const {
        name: repo,
        owner: { login: owner },
      } = event.repository;
      const { number: issue } = event.issue;

      await fetch(`${process.env.API_URL}/develop`, {
        method: "POST",
        body: JSON.stringify({
          issue,
          owner,
          repo,
          type: event.sender.type,
          missionUuid,
          maxSteps: 3,
        }),
      });
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issue,
        body: `May the Force be with us as we embark on this journey.`,
      });
    }
  } else if (event.action === "submitted" && "pull_request" in event) {
    const { state: reviewState } = event.review;
    // TODO - ensure that the review is for a PR we own
    if (reviewState === "approved") {
        // TODO - comment on PR your thanks, add release commit, merge PR 
    } else if (reviewState === "changes_requested") {
        // TODO - comment on PR that you're work on it right away, push new commits
    } else if (reviewState === "commented") {
        // TODO - respond to each comment before resolving
    } else if (reviewState === "dismissed") {
        // TODO - investigate what this means
    } else {
        // TODO - zodify WebhookEvent bc this shouldn't be possible
    }
  }
  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
