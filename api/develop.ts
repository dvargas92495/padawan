import type { Handler } from "aws-lambda";
import { z } from "zod";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { Tool } from "langchain/tools";
import { initializeAgentExecutor } from "langchain/agents";
import { Octokit } from "@octokit/rest";
import { v4 } from "uuid";
import { execSync } from "child_process";
import fs from "fs";
import getInstallationToken from "../src/utils/getInstallationToken";
import appClient from "../src/utils/appClient";

class GithubCodeSearchTool extends Tool {
  name = "Github Code Search";
  description = `Code search looks through the files hosted on GitHub. You can also filter the results:
- install repo:charles/privaterepo	  Find all instances of install in code from the repository charles/privaterepo.
- shogun user:heroku	  Find references to shogun from all public heroku repositories.
- join extension:coffee 	Find all instances of join in code with coffee extension.
- system size:>1000	  Find all instances of system in code of file size greater than 1000kbs.
- examples path:/docs/	  Find all examples in the path /docs/.
- replace fork:true	  Search replace in the source code of forks.`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.search
      .code({
        q: input,
      })
      .then((res) => {
        return JSON.stringify(res.data);
      });
  }
}

class GithubIssueGetTool extends Tool {
  name = "Github Issue Get";
  description = `Get an issue from a GitHub repository. Please format your input as a JSON object with the following parameters:
- owner: (string) [REQUIRED] The account owner of the repository. The name is not case sensitive.
- repo: (string) [REQUIRED] The name of the repository. The name is not case sensitive.
- issue_number: (number) [REQUIRED] The number that identifies the issue.`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.issues
      .get(JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, "")))
      .then((res) => {
        return JSON.stringify(res.data, null, 2);
      })
      .catch((e) => {
        return JSON.stringify(e.response.data);
      });
  }
}

class GithubPullRequestCreateTool extends Tool {
  name = "Github Pull Request Create";
  description = `Create a pull request. Please format your input as a JSON object with the following parameters:
- owner: (string) [REQUIRED] The account owner of the repository. The name is not case sensitive.
- repo: (string) [REQUIRED] The name of the repository. The name is not case sensitive.
- title: (string) [REQUIRED] The title of the new pull request. To close a GitHub issue with this pull request, include the keyword "Closes" followed by the issue number in the pull request's title.
- head: (string) [REQUIRED] The name of the branch where your changes are implemented. Make sure you have changes committed on a separate branch before you create a pull request.
- base: (string) [REQUIRED] The name of the branch you want the changes pulled into. This should be an existing branch on the current repository. You cannot submit a pull request to one repository that requests a merge to a base of another repository.
- body: (string) [OPTIONAL] The contents of the pull request.`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.pulls
      .create(JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, "")))
      .then((res) => {
        return JSON.stringify(res.data, null, 2);
      })
      .catch((e) => {
        return JSON.stringify(e.response.data);
      });
  }
}

class GithubBranchGetTool extends Tool {
  name = "Github Branch Get";
  description = `Get a branch from a GitHub repository. Please format your input as a JSON object with the following parameters:
  - owner: (string) [REQUIRED] The account owner of the repository. The name is not case sensitive.
  - repo: (string) [REQUIRED] The name of the repository. The name is not case sensitive.
  - branch: (string) [REQUIRED] The name of the branch. Cannot contain wildcard characters`;
  octokit: Octokit;
  constructor({ auth }: { auth?: string }) {
    super();
    this.octokit = new Octokit({
      auth,
    });
  }
  async _call(input: string) {
    return this.octokit.repos
      .getBranch(
        JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, ""))
      )
      .then((res) => {
        return JSON.stringify(res.data, null, 2);
      })
      .catch((e) => {
        return JSON.stringify(e.response.data);
      });
  }
}

class GitCloneRepository extends Tool {
  name = "Git Clone Repository";
  description = `Clone a repository from GitHub into a new local directory. Please format your input as a url in the format https://github.com/[owner]/[repo].`;
  constructor() {
    super();
  }
  async _call(input: string) {
    const dir = input
      .split("/")
      .slice(-1)[0]
      .replace(/\.git$/, "");
    execSync(`git clone ${input}`, { stdio: "inherit" });
    return `Cloned repository and changed current directory into ${dir}.`;
  }
}

class ProcessChDir extends Tool {
  name = "Change Current Directory";
  description = `Switch your current working direcroty. Please format your input as the path to the directory relative your current working directory.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    const dir = input
      .split("/")
      .slice(-1)[0]
      .replace(/\.git$/, "");
    execSync(`git clone ${input}`, { stdio: "inherit" });
    return `Cloned repository and changed current directory into ${dir}.`;
  }
}

class GitCheckoutNewBranch extends Tool {
  name = "Git Checkout New Branch";
  description = `Create a new branch in a local repository. Please format your input as a JSON object with the following parameters:
- branch: (string) [REQUIRED] The name of the branch. Cannot contain wildcard characters
- root: (string) [REQUIRED] The path to the root of the repository. Should always use /tmp/[repo]`;
  constructor() {
    super();
  }
  async _call(input: string) {
    const { branch, root } = JSON.parse(
      input.trim().replace(/^```/, "").replace(/```$/, "")
    );
    if (!fs.existsSync(root)) {
      return `Directory ${root} does not exist. Please clone the repository first.`;
    }
    if (process.cwd() !== root) {
      process.chdir(root);
    }
    execSync(`git checkout -b ${branch}`, { stdio: "inherit" });
    return `Successfully created new branch ${branch} in ${root}`;
  }
}

class GitAddFile extends Tool {
  name = "Git Add File";
  description = `Add file contents to be staged for a commit. Please format your input as a path to the file, relative to the current directory.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    execSync(`git add ${input}`, { stdio: "inherit" });
    return `Successfully added ${input} to the staging area.`;
  }
}

class GitCommit extends Tool {
  name = "Git Commit";
  description = `Record all files added to the staging area as changes to the repository. Please format your input as a message summarizing the word done for the commit`;
  constructor() {
    super();
  }
  async _call(input: string) {
    const out = execSync(`git commit -m "${input}"`).toString();
    if (out === "nothing to commit, working tree clean") return out;
    return `Successfully committed changes.`;
  }
}

class GitPushBranch extends Tool {
  name = "Git Push Branch";
  description = `Push your local branch to the remote repository. Please format your input as the name of the branch to push.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    execSync(`git push origin "${input}"`, { stdio: "inherit" });
    return `Successfully pushed branch to remote repository.`;
  }
}

class FsReadFile extends Tool {
  name = "Fs Read File";
  description = `Read a file from the filesystem. Please format your input as a path relative to your current directory.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    return fs.readFileSync(input.trim(), "utf8");
  }
}

class FsInsertText extends Tool {
  name = "Fs Insert Text";
  description = `Insert text to a file in the file system. Please format your input as a json object with the following parameters:
- path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
- text: (string) [REQUIRED] The text to insert into the file.
- position: (number) [OPTIONAL] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    const {
      path,
      text,
      position = text.length,
    } = JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, ""));
    const content = fs.readFileSync(input.trim(), "utf8");
    const newContent = `${content.slice(0, position)}${text}${content.slice(
      position
    )}`;
    fs.writeFileSync(path, newContent);
    return `Successfully inserted text into ${path}.`;
  }
}

class FsRemoveText extends Tool {
  name = "Fs Remove Text";
  description = `Remove text from a file in the file system. Please format your input as a json object with the following parameters:
- path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
- position: (number) [REQUIRED] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.
- length: (number) [REQUIRED] The length of the text to remove from the file.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    const { path, length, position } = JSON.parse(
      input.trim().replace(/^```/, "").replace(/```$/, "")
    );
    const content = fs.readFileSync(input.trim(), "utf8");
    const newContent = `${content.slice(0, position)}${content.slice(
      position + length
    )}`;
    fs.writeFileSync(path, newContent);
    return `Successfully inserted text into ${path}.`;
  }
}

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
  type: z.literal("User").or(z.literal("Organization")),
});

const template =
  "You are an engineer working on the GitHub repository: {repo_full}. You have just been assigned to issue {issue}. Create a pull request that will close this issue.";
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
  process.chdir("/tmp");
  const auth = process.env.GITHUB_TOKEN;
  const tools: Tool[] = [
    new GithubCodeSearchTool({ auth }),
    new GithubIssueGetTool({ auth }),
    new GithubPullRequestCreateTool({ auth }),
    new GithubBranchGetTool({ auth }),
    new GitCloneRepository(),
    new GitCheckoutNewBranch(),
    new FsReadFile(),
    new FsInsertText(),
    new FsRemoveText(),
    new GitAddFile(),
    new GitCommit(),
    new GitPushBranch(),
  ];
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
  });
  console.log("Ready to call");
  return await executor.call({ input });
};

export default develop;
