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
import getMissionPath from "src/utils/getMissionPath";
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

const FsListFiles: Tool = {
  name: "Fs List Files",
  description: `List the files in a directory. Please format your input as a path relative to your current directory.`,
  call: async (input: string) => {
    return `The files in the ${input} directory include: ${fs
      .readdirSync(input.trim(), "utf8")
      .join(", ")}`;
  },
};

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
  type: z.literal("User").or(z.literal("Organization")),
  missionUuid: z.string(),
  maxSteps: z.number().default(5), // 15
});

const develop = async (evt: Parameters<Handler>[0]) => {
  const {
    issue,
    repo,
    owner,
    type: _type,
    missionUuid,
    maxSteps,
  } = zArgs.parse(evt);
  // TODO - need to refresh token if it's expired
  // const auth = await getInstallationToken(type, owner);
  // const auth = process.env.GITHUB_TOKEN;
  fs.mkdirSync(getMissionPath(missionUuid), { recursive: true });
  return;
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

  // TODO - need to replace
  const webhook = (data: Record<string, unknown>) =>
    fetch("", {
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
