import type { Handler } from "aws-lambda";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { v4 } from "uuid";
import type { AxiosError } from "axios";
import { sql, eq, desc } from "drizzle-orm";
import drizzle from "src/utils/drizzle";
import {
  tools as toolsTable,
  METHOD,
  PARAMETER_TYPE,
  toolParameters,
  missionEvents,
  missionSteps,
  missions,
} from "scripts/schema";
import getMissionPath from "src/utils/getMissionPath";
import crypto from "crypto";
import {
  OpenAIApi,
  Configuration,
  ChatCompletionRequestMessageFunctionCall,
} from "openai";
import {
  ChatMessageRole,
  GenerateResponse,
  GenerateResult,
} from "vellum-ai/api";
import vellum from "src/utils/vellumClient";

// const GitStatus: Tool = {
//   name: "Git Status",
//   description: `View all of the changes made to the repository since the last commit. The only acceptable input is "status".`,
//   call: async (input: string) => {
//     try {
//       return execSync(`git status`).toString();
//     } catch (e) {
//       if (e instanceof ChildProcess && e.stderr) {
//         return e.stderr.toString();
//       } else if (e instanceof Error) {
//         return e.message;
//       }
//       return "Unknown error occurred.";
//     }
//   },
// };

// const GitListBranches: Tool = {
//   name: "Git List Branches",
//   description: `List the branches in your local repository. The only acceptable input is the word "list".`,
//   call: async (_input: string) => {
//     const result = execSync(`git branch`).toString();
//     const branches = result.split("\n").map((b) => b.trim());
//     const currentIndex = branches.findIndex((b) => b.startsWith("*"));
//     branches[currentIndex] = branches[currentIndex].replace(/^\*\s*/, "");
//     const current = branches[currentIndex];
//     return `You're currently on branch ${current}. The following branches are available:\n${branches.join(
//       "\n"
//     )}`;
//   },
// };

// const FsRemoveText: Tool = {
//   name: "Fs Remove Text",
//   description: `Remove text from a file in the file system. Please format your input as a json object with the following parameters:
// - path: (string) [REQUIRED] The path to the file to insert text into, relative to your current directory.
// - position: (number) [REQUIRED] The position in the file to insert the text. If not provided, the text will be inserted at the end of the file.
// - length: (number) [REQUIRED] The length of the text to remove from the file.`,
//   call: async (input: string) => {
//     const { path, length, position } = JSON.parse(
//       input.trim().replace(/^```/, "").replace(/```$/, "")
//     );
//     const content = fs.readFileSync(input.trim(), "utf8");
//     const newContent = `${content.slice(0, position)}${content.slice(
//       position + length
//     )}`;
//     fs.writeFileSync(path, newContent);
//     return `Successfully inserted text into ${path}.`;
//   },
// };

// const FsListFiles: Tool = {
//   name: "Fs List Files",
//   description: `List the files in a directory. Please format your input as a path relative to your current directory.`,
//   call: async (input: string) => {
//     return `The files in the ${input} directory include: ${fs
//       .readdirSync(input.trim(), "utf8")
//       .join(", ")}`;
//   },
// };

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
  type: z.literal("User").or(z.literal("Organization")),
  missionUuid: z.string(),
  maxSteps: z.number().default(5), // 15
  useNative: z.boolean().default(false),
});

const invokeTool = ({
  missionUuid,
  api,
  method,
  body,
}: {
  missionUuid: string;
  api: string;
  method: METHOD;
  body: Record<string, string | number | boolean>;
}) => {
  const url = new URL(api);
  const headers: HeadersInit = {
    "x-padawan-mission": missionUuid,
    // Authorization
  };
  if (method === "GET" || method === "DELETE") {
    Object.entries(body).forEach(([key, value]) => {
      url.searchParams.append(key, value.toString());
    });
    return fetch(url.toString(), { method, headers });
  }
  headers["Content-Type"] = "application/json";
  return fetch(url.toString(), {
    method,
    body: JSON.stringify(body),
    headers,
  });
};

const zGeneration = z.object({
  name: z.string(),
  arguments: z
    .string()
    .transform((s) =>
      z.record(z.string().or(z.number()).or(z.boolean())).parse(JSON.parse(s))
    ),
});

const zGenerationString = z
  .string()
  .transform((s) => zGeneration.parse(JSON.parse(s)));

const develop = async (evt: Parameters<Handler>[0]) => {
  const {
    issue,
    repo,
    owner,
    type: _type,
    missionUuid,
    maxSteps,
    useNative,
  } = zArgs.parse(evt);
  console.log("running mission", missionUuid);
  const root = getMissionPath(missionUuid);
  fs.mkdirSync(root, { recursive: true });
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
      >`coalesce(
        jsonb_agg(
          jsonb_build_object(
            'uuid',${toolParameters.uuid},
            'name',${toolParameters.name},
            'description',${toolParameters.description},
            'type',${toolParameters.type}
          )
        ) FILTER (WHERE ${toolParameters.uuid} IS NOT NULL), 
        '[]'::jsonb
      )`,
    })
    .from(toolsTable)
    .leftJoin(toolParameters, eq(toolsTable.uuid, toolParameters.toolUuid))
    .groupBy(toolsTable.uuid);
  let iterations = 0;
  let finalOutput = "";
  const functions = tools.map((tool) => {
    return {
      name: tool.name.toLowerCase().replace(/\s/g, "_"),
      description: tool.description,
      parameters: {
        type: "object",
        required: tool.parameters.map((p) => p.name),
        properties: Object.fromEntries(
          tool.parameters.map((p) => [
            p.name,
            { type: p.type, description: p.description },
          ])
        ),
      },
    };
  });
  const apisByName = Object.fromEntries(
    tools.map((t) => [
      t.name.toLowerCase().replace(/\s/g, "_"),
      { api: t.api, method: t.method },
    ])
  );
  const functionsByName = Object.fromEntries(functions.map((f) => [f.name, f]));

  try {
    while (iterations < maxSteps) {
      const [signal] = await cxn
        .select({ status: missionEvents.status })
        .from(missionEvents)
        .where(eq(missionEvents.missionUuid, missionUuid))
        .orderBy(desc(missionEvents.createdDate))
        .limit(1);
      if (signal?.status === "STOP") {
        finalOutput = "Mission stopped due to an interruption signal.";
        break;
      }
      const previousMissionSteps = await cxn
        .select({
          observation: missionSteps.observation,
          functionName: missionSteps.functionName,
          functionArgs: missionSteps.functionArgs,
        })
        .from(missionSteps)
        .where(eq(missionEvents.missionUuid, missionUuid))
        .orderBy(desc(missionSteps.executionDate));
      const chatHistory = previousMissionSteps.flatMap((step) => [
        {
          role: "assistant" as const,
          function_call: {
            name: step.functionName,
            arguments: JSON.stringify(step.functionArgs),
          },
        },
        {
          role: "function" as const,
          content: step.observation,
          name: step.functionName,
        },
      ]);

      const response = useNative
        ? await new OpenAIApi(
            new Configuration({
              apiKey: process.env.OPENAI_API_KEY || "",
            })
          )
            .createChatCompletion({
              stop: undefined,
              model: "gpt-3.5-turbo-0613",
              temperature: 0,
              n: 1,
              messages: [
                {
                  role: "system",
                  content: `You are an engineer working on the GitHub repository: ${owner}/${repo}. You have just been assigned to issue #${issue}. Your mission is to create a pull request that satisfies the requirements of the issue.
  
            When the user asks, you must advise the next step, along with your thought process on why you want to make that action.`,
                },
                ...chatHistory,
                {
                  role: "user",
                  content: "What is the next action you need to take?",
                },
              ],
              functions,
            })
            .then((r): GenerateResponse => {
              return {
                results: [
                  {
                    data: {
                      completions: r.data.choices.map((c) => ({
                        id: r.data.id,
                        text: c.message?.function_call
                          ? JSON.stringify(c.message.function_call)
                          : "",
                        modelVersionId: r.data.model,
                      })),
                    },
                  },
                ],
              };
            })
            .catch(
              (e): GenerateResponse => ({
                results: [
                  {
                    error: {
                      message: JSON.stringify((e as AxiosError).response?.data),
                    },
                  },
                ],
              })
            )
        : await vellum.generate({
            deploymentName: "padawan-development",
            requests: [
              {
                inputValues: {
                  owner,
                  repo,
                  issue,
                },
                chatHistory: chatHistory.map(({ role, ...rest }) => ({
                  role: role.toUpperCase() as ChatMessageRole,
                  text: JSON.stringify(rest),
                })),
                // @ts-ignore - TODO support in Vellum directly
                overrides: {
                  functions,
                },
                // TODO chatMessages
              },
            ],
          });

      const [result] = response.results;
      if (result.error || !result.data) {
        finalOutput = `Mission failed due to a Model error: ${result.error?.message}`;
        break;
      }
      const generation = result.data.completions[0].text;
      if (!generation) {
        finalOutput = `Mission failed due to an Model Response error: No generation returned.`;
        break;
      }
      const parsed = zGenerationString.safeParse(generation);
      if (!parsed.success) {
        finalOutput = `Mission failed due to an Model Generation Parsing error: ${parsed.error.message}`;
        break;
      }
      const { name: functionName, arguments: functionArgs } = parsed.data;
      const executionDate = new Date();
      const hash = crypto
        .createHash("sha256")
        .update(executionDate.toJSON())
        .update(functionName);
      Object.entries(functionArgs)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, value]) => {
          hash.update(key).update(JSON.stringify(value));
        });
      const [{ stepUuid }] = await cxn
        .insert(missionSteps)
        .values({
          uuid: v4(),
          missionUuid,
          executionDate,
          functionName,
          functionArgs,
          // @deprecated
          stepHash: hash.digest("hex"),
        })
        .returning({ stepUuid: missionSteps.uuid });

      if (!stepUuid) {
        finalOutput = `Mission failed due to a DB error: Failed to record step.`;
        break;
      }

      const observation = !functionsByName[functionName]
        ? `We did not understand your last instruction`
        : await invokeTool({
            missionUuid,
            body: functionArgs,
            ...apisByName[functionName],
          })
            .then((r) => r.text())
            .catch((e) => e.message);

      await cxn
        .update(missionSteps)
        .set({
          observation,
          endDate: new Date(),
        })
        .where(eq(missionSteps.uuid, stepUuid));
      iterations++;
    }
  } catch (e) {
    finalOutput = `Mission failed due to an unexpected error: ${
      (e as Error).message
    }`;
  }
  const finish = finalOutput || "Stopped due to max iterations.";
  await cxn.insert(missionEvents).values({
    uuid: v4(),
    missionUuid,
    status: "FINISHED",
    createdDate: new Date(),
    details: finish,
  });
  const [{ missionLabel }] = await cxn
    .select({ missionLabel: missions.label })
    .from(missions)
    .where(eq(missions.uuid, missionUuid));
  const allEvents = await cxn
    .select({ details: missionEvents.details, status: missionEvents.status })
    .from(missionEvents)
    .where(eq(missionEvents.missionUuid, missionUuid));
  const missionReport = `Mission: ${missionLabel}
Mission ID: ${missionUuid}
Event Log:
${allEvents.map((evt) => `- [${evt.status}] - ${evt.details}`).join("\n")}`;
  await cxn.insert(missionEvents).values({
    uuid: v4(),
    missionUuid,
    status: "FINISHED",
    createdDate: new Date(),
    details: finish,
  });

  const fileName = path.join(root, `report.txt`);
  fs.writeFileSync(fileName, missionReport);
  // const { documentId } = 
  await vellum.documents.upload(
    fs.createReadStream(fileName),
    {
      label: `Mission Report for ${owner}/${repo}#${issue}`,
      addToIndexNames: ["padawan-missions"],
      externalId: missionUuid,
      keywords: [],
    }
  );
  cxn
    .update(missions)
    .set({
      // TODO
      // reportId: documentId,
      reportId: missionReport,
    })
    .where(eq(missions.uuid, missionUuid));
};

export default develop;
