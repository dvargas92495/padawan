import type { Handler } from "aws-lambda";
import { z } from "zod";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { Tool } from "langchain/tools";
import { initializeAgentExecutor } from "langchain/agents";
import { Octokit } from "@octokit/rest";
import getInstallationToken from "../src/utils/getInstallationToken";
import appClient from "../src/utils/appClient";

class GithubSearchTool extends Tool {
  name = "Github Search";
  description = "Searches Github for a given query";
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    // need to massage this search. Current input: `dvargas92495/roamjs-smartblocks issue 63 file diffs`
    return this.octokit.search
      .code({
        q: input,
      })
      .then((res) => {
        if (!res.data.items.length) return "There were no results found";
        console.log("found", res.data.items.length, "results");
        return res.data.items[0].sha;
      });
  }
}

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
  type: z.literal("User").or(z.literal("Organization")),
});

const template =
  "You are an engineer working on the GitHub repository: {repo_full}. You have just been assigned to issue {issue}, which is titled {title}. Here is some additional information on the task: {body}. What are the file diffs necessary to complete this task?";
const prompt = new PromptTemplate({
  template: template,
  inputVariables: ["repo_full", "issue", "title", "body"],
});
const model = new OpenAI({ temperature: 0, modelName: "gpt-3.5-turbo" });
// const chain = new LLMChain({ llm: model, prompt: prompt });

const develop: Handler = async (evt: unknown) => {
  const { issue, repo, owner, type } = zArgs.parse(evt);
  // TODO - need to refresh token if it's expired
  // const auth = await getInstallationToken(type, owner);
  const auth = process.env.GITHUB_TOKEN;
  console.log("working on", owner, repo, issue, type, auth);
  const octokit = new Octokit({ auth });
  const issueData = await octokit.issues.get({
    owner,
    repo,
    issue_number: issue,
  });
  const tools: Tool[] = [new GithubSearchTool({ auth })];
  const executor = await initializeAgentExecutor(
    tools,
    model,
    "zero-shot-react-description",
    true
  );
  console.log("loaded executor");
  const input = await prompt.format({
    repo_full: `${owner}/${repo}`,
    issue: issue,
    title: issueData.data.title,
    body: issueData.data.body,
  });
  return await executor.call({ input });
};

export default develop;
