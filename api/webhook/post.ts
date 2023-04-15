import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { Octokit } from "@octokit/rest";
import jsonwebtoken from "jsonwebtoken";
import crypto from "crypto";
import { WebhookEvent } from "@octokit/webhooks-types";
import { S3 } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const getToken = (id = 0) =>
  new S3({})
    .getObject({
      Bucket: "app.davidvargas.me",
      Key: `.secret/access-tokens/${id}`,
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

const logic = async (args: Record<string, unknown>) => {
  const event = args as WebhookEvent;
  if ("action" in event && event.action === "labeled" && "issue" in event) {
    const auth = await getToken(event.installation?.id);
    const octokit = await new Octokit({
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

export default createAPIGatewayProxyHandler({
  logic,
  validate: (args) => {
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
  },
});
