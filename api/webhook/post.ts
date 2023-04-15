import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { Octokit } from "@octokit/rest";
import jsonwebtoken from "jsonwebtoken";
import crypto from "crypto";
import { WebhookEvent } from "@octokit/webhooks-types";
import { S3 } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import appClient from "src/utils/appClient";

const getToken = (id = 0, type: "user" | "bot" = "bot") =>
  new S3({})
    .getObject({
      Bucket: "app.davidvargas.me",
      Key: `.secret/access-tokens/${id}/${type}`,
    })
    .then((r) => {
      const Body = r.Body as Readable;
      if (!Body) throw new Error(`No token found for installation ${id}`);
      const chunks: Buffer[] = [];
      return new Promise<string>((resolve, reject) => {
        Body.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        Body.on("error", (err) => reject(err));
        Body.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    });

const getInstallationToken = (
  type: "Bot" | "User" | "Organization",
  owner: string
) => {
  if (type === "Bot") {
    return process.env.GITHUB_APP_TOKEN;
  } else if (type === "User") {
    return appClient.apps
      .getUserInstallation({
        username: owner,
      })
      .then((r) => getToken(r.data.id, "bot"));
  } else {
    return appClient.apps
      .getOrgInstallation({
        username: owner,
      })
      .then((r) => getToken(r.data.id, "bot"));
  }
};

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
