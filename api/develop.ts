import type { Handler } from "aws-lambda";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { execSync, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 } from "uuid";
import { VellumClient } from "vellum-ai";
import { sql, eq } from "drizzle-orm";
import drizzle from "src/utils/drizzle";
import {
  tools as toolsTable,
  METHOD,
  PARAMETER_TYPE,
  toolParameters,
} from "scripts/schema";
// import getInstallationToken from "../src/utils/getInstallationToken";
// import appClient from "../src/utils/appClient";

type AgentStep = {
  observation: string;
  action: string;
  actionInput: string;
  thought: string;
};

type Tool = {
  name: string;
  description: string;
  call: (arg: string) => Promise<string>;
};

const GitCloneRepository: Tool = {
  name: "Git Clone Repository",
  description: `Clone a repository from GitHub into a new local directory. Please format your input as a url in the format https://github.com/[owner]/[repo].`,
  call: async (input: string) => {
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
  },
};

const ProcessChDir: Tool = {
  name: "Change Current Directory",
  description: `Switch your current working directory. Please format your input as the path to the directory relative your current working directory.`,
  call: async (input: string) => {
    if (!fs.existsSync(input)) return `Directory ${input} does not exist.`;
    process.chdir(input);
    return `Changed current directory into ${input}.`;
  },
};

const GitCheckoutNewBranch: Tool = {
  name: "Git Checkout New Branch",
  description: `Create a new branch in a local repository. Please format your input as a JSON object with the following parameters:
- branch: (string) [REQUIRED] The name of the branch. Cannot contain wildcard characters
- root: (string) [REQUIRED] The path to the root of the repository. Should always use /tmp/[repo]`,
  call: async (input: string) => {
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
  },
};

const GitCheckoutBranch: Tool = {
  name: "Git Checkout Branch",
  description: `Switch to a branch in a local repository. This command does not switch your current working directory. Please format your input as a string representing just the branch name.`,
  call: async (input: string) => {
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
  },
};

const GitAddFile: Tool = {
  name: "Git Add File",
  description: `Add file contents to be staged for a commit. Please format your input as a path to the file, relative to the current directory.`,
  call: async (input: string) => {
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
  },
};

const GitStatus: Tool = {
  name: "Git Status",
  description: `View all of the changes made to the repository since the last commit. The only acceptable input is "status".`,
  call: async (input: string) => {
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
  },
};

const GitCommit: Tool = {
  name: "Git Commit",
  description: `Record all files added to the staging area as changes to the repository. Please format your input as a message summarizing the word done for the commit`,
  call: async (input: string) => {
    const out = execSync(`git commit -m "${input}"`).toString();
    if (out === "nothing to commit, working tree clean") return out;
    return `Successfully committed changes.`;
  },
};

const GitPushBranch: Tool = {
  name: "Git Push Branch",
  description: `Push your local branch to the remote repository. Please format your input as the name of the branch to push.`,
  call: async (input: string) => {
    execSync(`git push origin "${input}"`, { stdio: "inherit" });
    return `Successfully pushed branch to remote repository.`;
  },
};

const GitListBranches: Tool = {
  name: "Git List Branches",
  description: `List the branches in your local repository. The only acceptable input is the word "list".`,
  call: async (_input: string) => {
    const result = execSync(`git branch`).toString();
    const branches = result.split("\n").map((b) => b.trim());
    const currentIndex = branches.findIndex((b) => b.startsWith("*"));
    branches[currentIndex] = branches[currentIndex].replace(/^\*\s*/, "");
    const current = branches[currentIndex];
    return `You're currently on branch ${current}. The following branches are available:\n${branches.join(
      "\n"
    )}`;
  },
};

const FsReadFile: Tool = {
  name: "Fs Read File",
  description: `Read a file from the filesystem. Please format your input as a path relative to your current directory.`,
  call: async (input: string) => {
    return fs.readFileSync(input.trim(), "utf8");
  },
};

const FsListFiles: Tool = {
  name: "Fs List Files",
  description: `List the files in a directory. Please format your input as a path relative to your current directory.`,
  call: async (input: string) => {
    return `The files in the ${input} directory include: ${fs
      .readdirSync(input.trim(), "utf8")
      .join(", ")}`;
  },
};

const FsInsertText: Tool = {
  name: "Fs Insert Text",
  description: `Insert text to a file in the file system. Please format your input as a json object with the following parameters:
- path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
- text: (string) [REQUIRED] The text to insert into the file.
- position: (number) [OPTIONAL] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.`,
  call: async (input: string) => {
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
  },
};

const FsRemoveText: Tool = {
  name: "Fs Remove Text",
  description: `Remove text from a file in the file system. Please format your input as a json object with the following parameters:
- path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
- position: (number) [REQUIRED] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.
- length: (number) [REQUIRED] The length of the text to remove from the file.`,
  call: async (input: string) => {
    const { path, length, position } = JSON.parse(
      input.trim().replace(/^```/, "").replace(/```$/, "")
    );
    const content = fs.readFileSync(input.trim(), "utf8");
    const newContent = `${content.slice(0, position)}${content.slice(
      position + length
    )}`;
    fs.writeFileSync(path, newContent);
    return `Successfully inserted text into ${path}.`;
  },
};

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
  type: z.literal("User").or(z.literal("Organization")),
  missionUuid: z.string(),
  webhookUrl: z.string(),
  maxSteps: z.number().default(5), // 15
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
  // TODO - need to refresh token if it's expired
  // const auth = await getInstallationToken(type, owner);
  // const auth = process.env.GITHUB_TOKEN;
  const previousWorkingDirectory = process.cwd();
  const newWorkingDirectory = `/tmp/${missionUuid}`;
  fs.mkdirSync(newWorkingDirectory);
  process.chdir(newWorkingDirectory);
  // const octokit = new Octokit({ auth });
  const cxn = drizzle();
  const tools = await cxn
    .select({
      uuid: toolsTable.uuid,
      name: sql<string>`min(${toolsTable.name})`,
      description: sql<string>`min(${toolsTable.description})`,
      api: sql<string>`min(${toolsTable.api})`,
      method: sql<METHOD>`min(${toolsTable.method})`,
      parameters: sql<
        {
          uuid: string;
          name: string;
          description: string;
          type: PARAMETER_TYPE;
        }[]
      >`json_agg(tool_parameters.*)`,
    })
    .from(toolsTable)
    .leftJoin(toolParameters, eq(toolsTable.uuid, toolParameters.toolUuid))
    .groupBy(toolsTable.uuid);

  const toolsByName = Object.fromEntries(
    tools.map((t) => [t.name.toLowerCase(), t])
  );
  const steps: AgentStep[] = [];
  const formatSteps = (join = "\n") =>
    steps
      .map(
        (s, i) =>
          `${i + 1}. ${s.thought}. Executed \`${s.action}\` with input "${
            s.actionInput
          }". ${s.observation.trim()}`
      )
      .join(join);
  let iterations = 0;
  let finalOutput = "";
  const vellum = new VellumClient({
    apiKey: process.env.VELLUM_API_KEY || "",
  });

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

    const response = await vellum.generate({
      deploymentName: "padawan-development",
      requests: [
        {
          inputValues: {
            owner,
            repo,
            issue,
            tools: tools
              .map((tool) => `- ${tool.name}: ${tool.description}`)
              .join("\n"),
          },
        },
      ],
    });

    const [result] = response.results;
    if (result.error || !result.data) {
      finalOutput = `Mission failed due to an error: ${result.error?.message}`;
      break;
    }
    const generation = result.data.completions[0].text;
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

    let tool;
    const observation = !output.action
      ? `We did not understand your last instruction`
      : (tool = toolsByName[output.action.toLowerCase()])
      ? await fetch(tool.api, {
          method: tool.method,
          body: output.actionInput,
        })
          .then((r) => r.text())
          .catch((e) => e.message)
      : `Your last selected Action is not a valid tool, try another one. As a reminder, your options are ${tools
          .map((tool) => `"${tool.name}"`)
          .join(", ")}.`;
    const fullStep = { ...output, observation };
    steps.push(fullStep);

    await webhook({
      method: "RECORD_OBSERVATION",
      stepUuid: output.uuid,
      observation,
    });
    iterations++;
  }
  process.chdir(previousWorkingDirectory);
  const finish = finalOutput || "Stopped due to max iterations.";
  const missionReport = `Mission: Close ${owner}/${repo}#${issue}
Mission ID: ${missionUuid}
Steps Taken:
${formatSteps("\n\n")}

I then finished the mission after: ${finish}`;
  await webhook({
    method: "FINISH_MISSION",
    missionReport,
    missionUuid,
  });
  const fileName = path.join(os.tmpdir(), `${missionUuid}.txt`);
  fs.writeFileSync(fileName, missionReport);
  await vellum.documents.upload(fs.createReadStream(fileName), {
    label: `Mission Report for ${owner}/${repo}#${issue}`,
    addToIndexNames: ["padawan-missions"],
    externalId: missionUuid,
    keywords: [],
  });
};

export default develop;
