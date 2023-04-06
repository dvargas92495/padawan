import createAPIGatewayHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import axios from "axios";
import { Octokit } from "@octokit/rest";
import jsonwebtoken from "jsonwebtoken";
import { S3 } from "@aws-sdk/client-s3";

const logic = async (args: {
  code: string;
  customParams: Record<string, string>;
}) => {
  const { data } = await axios
    .post<{ access_token: string }>(
      `https://github.com/login/oauth/access_token`,
      {
        code: args.code,
        redirect_uri: "https://app.davidvargas.me/oauth/padawan",
        client_id: process.env.OAUTH_CLIENT_ID,
        client_secret: process.env.OAUTH_CLIENT_SECRET,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    )
    .catch((e) =>
      Promise.reject(
        new Error(`Failed to get access token: ${e.response.data}`)
      )
    );
  const { access_token } = data;
  await new S3({}).putObject({
    Bucket: "app.davidvargas.me",
    Key: `.secret/access-tokens/${args.customParams.installation_id}`,
    Body: Buffer.from(access_token),
  });
  return {};
};

export default createAPIGatewayHandler(logic);
