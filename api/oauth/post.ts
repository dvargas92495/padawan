import createAPIGatewayHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import axios from "axios";
import { S3 } from "@aws-sdk/client-s3";
import { Octokit } from "@octokit/rest";
import appClient from "src/utils/appClient";

const logic = async (args: {
  code: string;
  customParams: Record<string, string>;
}) => {
  const s3 = new S3({});
  const { data } = await axios
    .post<{ access_token: string; refresh_token: string }>(
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
  const { access_token, refresh_token, ...rest } = data;
  console.log(rest);
  await s3.putObject({
    Bucket: "app.davidvargas.me",
    Key: `.secret/access-tokens/${args.customParams.installation_id}/user`,
    Body: Buffer.from(access_token),
  });
  await s3.putObject({
    Bucket: "app.davidvargas.me",
    Key: `.secret/access-tokens/${args.customParams.installation_id}/refresh`,
    Body: Buffer.from(refresh_token),
  });
  const botToken = await appClient.apps.createInstallationAccessToken({
    installation_id: parseInt(args.customParams.installation_id),
  });
  await s3.putObject({
    Bucket: "app.davidvargas.me",
    Key: `.secret/access-tokens/${args.customParams.installation_id}/bot`,
    Body: Buffer.from(botToken.data.token),
  });
  return { success: true };
};

export default createAPIGatewayHandler(logic);
