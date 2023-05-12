import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { Octokit } from "@octokit/rest";
import crypto from "crypto";
import { WebhookEvent } from "@octokit/webhooks-types";
import getInstallationToken from "src/utils/getInstallationToken";
import { Lambda } from "@aws-sdk/client-lambda";
import { v4 } from "uuid";

const logic = async (args: Record<string, unknown>) => {
  const event = args as WebhookEvent;
  if ("action" in event && event.action === "labeled" && "issue" in event) {
    const auth = await getInstallationToken(
      event.sender.type,
      event.sender.login
    );
    const octokit = new Octokit({
      auth,
    });
    if (event.label?.name === "padawan") {
      const lambda = new Lambda({});
      const missionUuid = v4();
      const { name, owner } = event.repository;
      // TODO: ideally this is stored with and fetched from the github app or the owner profile
      const webhookUrl = await octokit.repos
        .getContent({
          owner: owner.login,
          repo: name,
          path: "package.json",
        })
        .then((r) => {
          if ("type" in r.data && r.data.type === "file") {
            const json = JSON.parse(Buffer.from(r.data.content).toString());
            return json.padawan?.webhookUrl || "";
          }
          return "";
        })
        .catch(() => "");
      const issue = event.issue.number;
      await fetch(webhookUrl, {
        method: "POST",
        body: JSON.stringify({
          missionUuid,
          method: "CREATE",
          label: `Issue #${issue} from ${owner}/${name}`,
        }),
      });

      await lambda.invoke({
        FunctionName: "padawan-dev-develop",
        Payload: Buffer.from(
          JSON.stringify({
            issue: event.issue?.number || 0,
            owner: event.repository?.owner?.login || "",
            repo: event.repository.name,
            type: event.sender.type,
            missionUuid: v4(),
            webhookUrl,
          })
        ),
      });
      await octokit.issues.createComment({
        owner: event.repository?.owner?.login || "",
        repo: event.repository?.name || "",
        issue_number: event.issue?.number || 0,
        body: `May the Force be with us as we embark on this journey.`,
      });
    }
  }
  return { success: true };
};

const validate = (args: {
  body: string | null;
  headers: Record<string, string | undefined>;
}) => {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error(`Missing Webhook Secret`);
  if (!args.body) throw new Error(`Empty Body`);
  const computed = crypto
    .createHash("sha256")
    .update(webhookSecret)
    .update(args.body)
    .digest("hex");
  const actual = (
    (args.headers["X-Hub-Signature-256"] as string) || ""
  ).replace("sha256=", "");
  console.log("compare hashes", computed, actual);
  return true;
};

export default createAPIGatewayProxyHandler({
  logic,
  validate,
});
