import { Octokit } from "@octokit/rest";
import jsonwebtoken from "jsonwebtoken";

const privateKey = process.env.APP_PRIVATE_KEY || "";

const appClient = new Octokit({
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

export default appClient;
