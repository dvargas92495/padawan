import createAPIGatewayHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { v4 } from "uuid";

const logic = async () => {
  return {
    tools: [
      {
        uuid: v4(),
        name: "github_issue_get",
        description:
          "Get an issue from a GitHub repository detailing what the issue is about.",
        parameters: [
          {
            name: "owner",
            type: "string",
            description: "The owner of the repository.",
          },
          {
            name: "repo",
            type: "string",
            description: "The name of the repository.",
          },
          {
            name: "issue_number",
            type: "number",
            description: "The number of the issue.",
          },
        ],
        api: "https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}",
        method: "GET",
      },
    ],
  };
};

export type Response = Awaited<ReturnType<typeof logic>>;

export default createAPIGatewayHandler(logic);
