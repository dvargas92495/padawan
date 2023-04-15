import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { Octokit } from "@octokit/rest";
import jsonwebtoken from "jsonwebtoken";
import crypto from "crypto";
import { WebhookEvent } from "@octokit/webhooks-types";

const logic = async (args: Record<string, unknown>) => {
  const computed = crypto
    .createHash("sha256")
    .update(process.env.WEBHOOK_SECRET || "")
    .update(JSON.stringify(args))
    .digest();
  const actual = args["X-Hub-Signature-256"];
  console.log("compare hashes", computed, actual);
  const privateKey = process.env.APP_PRIVATE_KEY;
  if (!privateKey) throw new Error(`Missing App Private Key`);
  const event = args as WebhookEvent;
  const octokit = await new Octokit({
    auth: jsonwebtoken.sign(
      {
        iss: 313603,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 * 10,
      },
      privateKey,
      {
        algorithm: "RS256",
      }
    ),
  });
  if ("action" in event && event.action === "labeled" && "issue" in event) {
    if (event.label?.name === "padawan") {
      await octokit.issues.createComment({
        owner: event.repository?.owner?.login || "",
        repo: event.repository?.name || "",
        issue_number: event.issue?.number || 0,
        body: `As a humble Padawan of the Jedi Order, I am honored to have been entrusted with this task. 
        With the wisdom of the Force as my guide, I shall embark on this mission with unwavering dedication and resolve.
        
        I have studied the details of the issue and am prepared to face the challenges that lie ahead. 
        I shall work diligently to bring balance to the code and ensure that harmony is restored.
        
        May the Force be with us as we embark on this journey.`,
      });
    }
  }
  return { success: true };
};

export default createAPIGatewayProxyHandler({
  logic,
  includeHeaders: ["X-Hub-Signature-256"],
});
