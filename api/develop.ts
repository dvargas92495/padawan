import type { Handler } from "aws-lambda";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { execSync, ChildProcess } from "child_process";
import fs from "fs";
import { OpenAIApi, Configuration } from "openai";
import { v4 } from "uuid";
import { PineconeClient } from "@pinecone-database/pinecone";
// import getInstallationToken from "../src/utils/getInstallationToken";
// import appClient from "../src/utils/appClient";

type AgentStep = {
  observation: string;
  action: string;
  actionInput: string;
  thought: string;
};

abstract class Tool {
  verbose: boolean;
  abstract name: string;
  abstract description: string;
  returnDirect = false;

  protected abstract _call(arg: string): Promise<string>;
  constructor(verbose = false) {
    this.verbose = verbose;
  }
  async call(arg: string) {
    return await this._call(arg);
  }
}

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
        return res.data.body || "The issue is empty.";
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
    try {
      execSync(`git clone ${input}`);
      process.chdir(input);
      return `Cloned repository and changed current directory into ${dir}.`;
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        const err = e.stderr.toString();
        if (
          /^fatal: destination path '[^']+' already exists and is not an empty directory/.test(
            err
          )
        ) {
          return `Directory ${dir} already exists. This is probably your cloned repository, change your current directory to it.`;
        }
        return err;
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class ProcessChDir extends Tool {
  name = "Change Current Directory";
  description = `Switch your current working directory. Please format your input as the path to the directory relative your current working directory.`;
  constructor() {
    super();
  }
  async _call(input: string) {
    process.chdir(input);
    return `Changed current directory into ${input}.`;
  }
}

class GitCheckoutNewBranch extends Tool {
  name = "Git Checkout New Branch";
  description = `Create a new branch in a local repository. Please format your input as a JSON object with the following parameters:
- branch: (string) [REQUIRED] The name of the branch. Cannot contain wildcard characters
- root: (string) [REQUIRED] The path to the root of the repository. Should always use /tmp/[repo]`;
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
    try {
      const result = execSync(`git checkout -b ${branch}`);
      return result.toString();
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitCheckoutBranch extends Tool {
  name = "Git Checkout Branch";
  description = `Switch to a branch in a local repository. This command does not switch your current working directory. Please format your input as a string representing just the branch name.`;
  async _call(input: string) {
    try {
      const result = execSync(`git checkout ${input}`);
      return result.toString();
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitAddFile extends Tool {
  name = "Git Add File";
  description = `Add file contents to be staged for a commit. Please format your input as a path to the file, relative to the current directory.`;
  async _call(input: string) {
    try {
      execSync(`git add ${input}`);
      return `Successfully added ${input} to the staging area.`;
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitStatus extends Tool {
  name = "Git Status";
  description = `View all of the changes made to the repository since the last commit. The only acceptable input is "status".`;
  async _call(input: string) {
    try {
      return execSync(`git status`).toString();
    } catch (e) {
      if (e instanceof ChildProcess && e.stderr) {
        return e.stderr.toString();
      } else if (e instanceof Error) {
        return e.message;
      }
      return "Unknown error occurred.";
    }
  }
}

class GitCommit extends Tool {
  name = "Git Commit";
  description = `Record all files added to the staging area as changes to the repository. Please format your input as a message summarizing the word done for the commit`;
  async _call(input: string) {
    const out = execSync(`git commit -m "${input}"`).toString();
    if (out === "nothing to commit, working tree clean") return out;
    return `Successfully committed changes.`;
  }
}

class GitPushBranch extends Tool {
  name = "Git Push Branch";
  description = `Push your local branch to the remote repository. Please format your input as the name of the branch to push.`;
  async _call(input: string) {
    execSync(`git push origin "${input}"`, { stdio: "inherit" });
    return `Successfully pushed branch to remote repository.`;
  }
}

class GitListBranches extends Tool {
  name = "Git List Branches";
  description = `List the branches in your local repository. The only acceptable input is the word "list".`;
  async _call(_input: string) {
    const result = execSync(`git branch`).toString();
    const branches = result.split("\n").map((b) => b.trim());
    const currentIndex = branches.findIndex((b) => b.startsWith("*"));
    branches[currentIndex] = branches[currentIndex].replace(/^\*\s*/, "");
    const current = branches[currentIndex];
    return `You're currently on branch ${current}. The following branches are available:\n${branches.join(
      "\n"
    )}`;
  }
}

class FsReadFile extends Tool {
  name = "Fs Read File";
  description = `Read a file from the filesystem. Please format your input as a path relative to your current directory.`;
  async _call(input: string) {
    return fs.readFileSync(input.trim(), "utf8");
  }
}

class FsListFiles extends Tool {
  name = "Fs List Files";
  description = `List the files in a directory. Please format your input as a path relative to your current directory.`;
  async _call(input: string) {
    return `The files in the ${input} directory include: ${fs
      .readdirSync(input.trim(), "utf8")
      .join(", ")}`;
  }
}

class FsInsertText extends Tool {
  name = "Fs Insert Text";
  description = `Insert text to a file in the file system. Please format your input as a json object with the following parameters:
- path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
- text: (string) [REQUIRED] The text to insert into the file.
- position: (number) [OPTIONAL] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.`;
  async _call(input: string) {
    const {
      path,
      text,
      position = text.length,
    } = JSON.parse(input.trim().replace(/^```/, "").replace(/```$/, ""));
    const content = fs.readFileSync(path.trim(), "utf8");
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
  missionUuid: z.string(),
  webhookUrl: z.string(),
  maxSteps: z.number().default(3), // 15
});

const develop = async (evt: Parameters<Handler>[0]) => {
  const {
    issue,
    repo,
    owner,
    type: _type,
    webhookUrl,
    missionUuid,
    maxSteps,
  } = zArgs.parse(evt);
  console.log(
    "I've been assigned to issue",
    issue,
    "from",
    repo,
    "within",
    owner
  );
  // TODO - need to refresh token if it's expired
  // const auth = await getInstallationToken(type, owner);
  const auth = process.env.GITHUB_TOKEN;
  const tools: Tool[] = [
    new GithubCodeSearchTool({ auth }),
    new GithubIssueGetTool({ auth }),
    new GithubPullRequestCreateTool({ auth }),
    new GithubBranchGetTool({ auth }),
    new GitCloneRepository(),
    new GitCheckoutNewBranch(),
    new GitCheckoutBranch(),
    new GitListBranches(),
    new GitStatus(),
    new FsReadFile(),
    new FsInsertText(),
    new FsRemoveText(),
    new GitAddFile(),
    new GitCommit(),
    new GitPushBranch(),
    new ProcessChDir(),
    new FsListFiles(),
  ];

  const toolsByName = Object.fromEntries(
    tools.map((t) => [t.name.toLowerCase(), t])
  );
  const steps: AgentStep[] = [];
  const formatSteps = () =>
    steps
      .map(
        (s, i) =>
          `${i + 1}. ${s.thought}. Executed \`${s.action}\` with input "${
            s.actionInput
          }". ${s.observation}`
      )
      .join("\n");
  let iterations = 0;
  let finalOutput = "";
  const openAiApiClient = new OpenAIApi(
    new Configuration({
      apiKey: process.env.OPENAI_API_KEY || "",
    })
  );
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY || "",
    environment: process.env.PINECONE_ENVIRONMENT || "development",
  });
  const missionIndex = pinecone.Index("missions");

  const webhook = (data: Record<string, unknown>) =>
    fetch(webhookUrl, {
      method: "POST",
      body: JSON.stringify(data),
    }).then((r) => r.json());

  while (iterations < maxSteps) {
    const signal = await webhook({
      method: "GET_STATUS",
      missionUuid,
    });
    if (signal.status === "STOP") {
      finalOutput = "Mission stopped due to an interruption signal.";
      break;
    }
    const template = `You are an engineer working on the GitHub repository: ${owner}/${repo}. You have just been assigned to issue #${issue}. Your mission (id# ${missionUuid}) is to create a pull request that satisfies the requirements of the issue.
  
You have access to the following tools:
${tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}

${
  steps.length
    ? `This is an ongoing mission. Here are some of the previous steps you've taken:${formatSteps()}\n\n`
    : ""
}Now that I have given you the context of the mission, and have given you the tools you'll need to complete the mission, you will say what needs to be done next by using the following format:

Thought: you should always think transparently about what to do next before doing it
Action: the action to take. Must be exactly one of [${tools
      .map((tool) => tool.name)
      .join(",")}]
Action Input: the input to the action

What is the next step?`;

    const data = await openAiApiClient
      .createChatCompletion({
        stop: undefined,
        model: "gpt-3.5-turbo",
        temperature: 0,
        n: 1,
        messages: [
          {
            role: "user",
            content: template,
          },
        ],
      })
      .then((res) => res.data)
      .catch((e) => Promise.reject(JSON.stringify(e.response.data)));

    const generation = data.choices[0].message?.content ?? "";
    const output = {
      uuid: v4(),
      thought: /Thought: (.*)/.exec(generation)?.[1]?.trim() ?? "",
      action: /Action: (.*)/.exec(generation)?.[1]?.trim() ?? "",
      actionInput: /Action Input: (.*)$/s.exec(generation)?.[1]?.trim() ?? "",
      generation,
    };
    await webhook({
      method: "ADD_STEP",
      missionUuid,
      step: output,
    });

    const tool = toolsByName[output.action.toLowerCase()];
    const observation = tool
      ? await tool.call(output.actionInput).catch((e) => e.message)
      : `"${
          output.action
        }" is not a valid tool, try another one. As a reminder, your options are [${tools
          .map((tool) => tool.name)
          .join(",")}].`;
    const fullStep = { ...output, observation };
    steps.push(fullStep);

    await webhook({
      method: "RECORD_OBSERVATION",
      stepUuid: output.uuid,
      observation,
    });
    iterations++;
  }
  const finish = finalOutput || "Stopped due to max iterations.";
  const missionReport = `Mission: Close ${owner}/${repo}#${issue}
Mission ID: ${missionUuid}
Steps Taken:
${formatSteps()}

I then finished the mission after: ${finish}`;
  await webhook({
    method: "FINISH_MISSION",
    missionReport,
    missionUuid,
  });
  const embeddingResponse = await openAiApiClient.createEmbedding({
    input: [missionReport],
    model: "text-embedding-ada-002",
  });
  const embedding = embeddingResponse.data.data[0].embedding;
  await missionIndex.upsert({
    upsertRequest: {
      vectors: [
        {
          id: missionUuid,
          values: embedding,
        },
      ],
    },
  });
};

export default develop;
