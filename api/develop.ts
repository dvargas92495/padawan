import type { Handler } from "aws-lambda";
import { z } from "zod";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
// import { LLMChain } from "langchain/chains";
import { Tool } from "langchain/tools";
// import { Calculator } from "langchain/tools/calculator";
import { initializeAgentExecutor } from "langchain/agents";
import { GithubRepoLoader } from "langchain/document_loaders/web/github";
import { Octokit } from "@octokit/rest";
// import getInstallationToken from "../src/utils/getInstallationToken";

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
});

const template =
  "You are an engineer working on the GitHub repository: {repo_full}. You have just been assigned to issue {issue}, which is titled {title}. Here is some additional information on the task: {body}. What are the file diffs necessary to complete this task?";
const prompt = new PromptTemplate({
  template: template,
  inputVariables: ["repo_full", "issue", "title", "body"],
});
const model = new OpenAI({ temperature: 0, modelName: "gpt-3.5-turbo" });
const tools: Tool[] = [];
// const chain = new LLMChain({ llm: model, prompt: prompt });

const develop: Handler = async (evt: unknown) => {
  const { issue, repo, owner } = zArgs.parse(evt);
  console.log("working on", owner, repo, issue);
  const repoLoader = new GithubRepoLoader(
    `https://github.com/${owner}/${repo}`,
    { branch: "main", recursive: false, unknown: "warn" }
  );
  const docs = await repoLoader.load();
  console.log("repo loaded", docs.length);
  // const auth = await getInstallationToken("User", owner);
  const octokit = new Octokit();
  const issueData = await octokit.issues.get({
    owner,
    repo,
    issue_number: issue,
  });
  const executor = await initializeAgentExecutor(
    tools,
    model,
    "zero-shot-react-description"
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
