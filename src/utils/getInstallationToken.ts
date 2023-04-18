import appClient from "./appClient";
import getToken from "./getToken";

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
        org: owner,
      })
      .then((r) => getToken(r.data.id, "bot"));
  }
};

export default getInstallationToken;
