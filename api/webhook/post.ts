import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { Octokit } from "@octokit/rest";
import jsonwebtoken from "jsonwebtoken";
import crypto from "crypto";

const logic = async (args: Record<string, unknown>) => {
  const computed = crypto
    .createHash("sha256")
    .update(process.env.WEBHOOK_SECRET || "")
    .update(JSON.stringify(args))
    .digest();
  const actual = args["x-hub-signature-256"];
  console.log("args", args);
  console.log("compare hashes", computed, actual);
  const privateKey = process.env.APP_PRIVATE_KEY;
  if (!privateKey) throw new Error(`Missing App Private Key`);
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
  const app = await octokit.apps.getAuthenticated();
  console.log("App ID", app.data.id);
  return { success: true };
};

export default createAPIGatewayProxyHandler({
  logic,
  includeHeaders: ["x-hub-signature-256"],
});
