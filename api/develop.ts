import type { Handler } from "aws-lambda";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { v4 } from "uuid";
import type { AxiosError } from "axios";
import { eq, desc, asc } from "drizzle-orm";
import drizzle from "src/utils/drizzle";
import {
  METHOD,
  missionEvents,
  missionSteps,
  missions,
  tokens,
} from "scripts/schema";
import getMissionPath from "src/utils/getMissionPath";
import { ChatMessageRole, GenerateResponse } from "vellum-ai/api";
import vellum from "src/utils/vellumClient";
import nunjucks from "nunjucks";
import openai from "src/utils/openai";
import getFunction from "src/utils/getFunction";
import getToolQuery from "src/utils/getToolQuery";
nunjucks.configure({ autoescape: false });

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
  deploymentName: z.string().optional().default("padawan-development"),
});

const zGeneration = z.object({
  name: z.string(),
  arguments: z
    .string()
    .transform((s) =>
      z.record(z.string().or(z.number()).or(z.boolean())).parse(JSON.parse(s))
    ),
});

const develop = async (evt: Parameters<Handler>[0]) => {
  const {
    issue,
    repo,
    owner,
    type: _type,
    missionUuid,
    maxSteps,
    useNative,
    deploymentName,
  } = zArgs.parse(evt);
  const root = getMissionPath(missionUuid);
  fs.mkdirSync(root, { recursive: true });
  const cxn = drizzle();
  const tools = await getToolQuery(cxn);
  let iterations = 0;
  let finalOutput = "";
  const functions = tools.map(getFunction);
  const apisByName = Object.fromEntries(
    tools.map((t) => [
      t.name.toLowerCase().replace(/\s/g, "_"),
      { api: t.api, method: t.method, format: t.format },
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
        .orderBy(asc(missionSteps.executionDate))
        .where(eq(missionSteps.missionUuid, missionUuid));
      const chatHistory = previousMissionSteps.flatMap((step) => [
        {
          role: "assistant" as const,
          function_call: {
            name: step.functionName,
            arguments: JSON.stringify(step.functionArgs),
          },
          content: "",
        },
        {
          role: "function" as const,
          content: step.observation,
          name: step.functionName,
        },
      ]);

      const response = useNative
        ? await openai()
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
                          : c.message?.content || "",
                        modelVersionId: r.data.model,
                      })),
                    },
                  },
                ],
              };
            })
            .catch((e): GenerateResponse => {
              const error = (message: string): GenerateResponse => ({
                results: [
                  {
                    error: {
                      message,
                    },
                  },
                ],
              });
              const axiosError = e as AxiosError;
              if (!axiosError.isAxiosError) {
                return error(`Non-Axios Error: ${e.message || e.toString()}`);
              }
              if (!axiosError.response) {
                return error(`Non-Response Error: ${axiosError.message}`);
              }
              const { data } = axiosError.response;
              if (typeof data?.error?.message !== "string") {
                return error(
                  `Unknown Axios Data Error: ${JSON.stringify(data)}`
                );
              }
              return error(data.error.message);
            })
        : await vellum.generate({
            deploymentName,
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
              },
            ],
          });

      const [result] = response.results;
      if (result.error) {
        const { message: err } = result.error;
        finalOutput = err.includes(
          "That model is currently overloaded with other requests"
        )
          ? "Mission failed due to an OpenAI API error: Model is overloaded. Please try again later."
          : `Mission failed due to a Model error: ${
              result.error.message
            }\nChat History: ${JSON.stringify(chatHistory, null, 2)}`;
        break;
      }
      if (!result.data) {
        break;
      }
      const generation = result.data.completions[0].text;
      if (!generation) {
        finalOutput = `Mission failed due to an Model Response error: No generation returned.\nChat History: ${JSON.stringify(
          chatHistory,
          null,
          2
        )}`;
        break;
      }
      const generationJson = /^{.*}$/.test(generation)
        ? JSON.parse(generation)
        : {
            name: "none",
            arguments: JSON.stringify({
              content: generation,
            }),
          };
      const parsed = zGeneration.safeParse(generationJson);
      if (!parsed.success) {
        finalOutput = `Mission failed due to an Model Generation Parsing error: ${parsed.error.message}`;
        break;
      }
      const { name: functionName, arguments: functionArgs } = parsed.data;
      const stepUuid = v4();
      await cxn.insert(missionSteps).values({
        uuid: stepUuid,
        missionUuid,
        executionDate: new Date(),
        functionName,
        functionArgs,
      });
      // .returning({ stepUuid: missionSteps.uuid });

      const invokeTool = async ({
        api,
        method,
        body,
        format,
      }: {
        api: string;
        method: METHOD;
        body: Record<string, string | number | boolean>;
        format?: string;
      }) => {
        const url = new URL(
          nunjucks.renderString(api, {
            ...body,
            padawan_api: process.env.API_URL,
          })
        );
        const headers: HeadersInit = {
          "x-padawan-mission": missionUuid,
        };
        const [token] = await cxn
          .select({ token: tokens.token })
          .from(tokens)
          .where(eq(tokens.domain, url.host));
        if (token) {
          headers.Authorization = `Bearer ${token.token}`;
        }
        const responseHandler = async (r: Response): Promise<string> => {
          if (!r.ok) {
            const text = await r.text();
            throw new Error(
              `${method} request to ${url.toString()} failed (${
                r.status
              }): ${text}`
            );
          }
          if (r.headers.get("Content-Type")?.startsWith("application/json")) {
            const data = await r.json();
            return format
              ? nunjucks.renderString(format, data)
              : JSON.stringify(data);
          }
          return r.text();
        };
        if (method === "GET" || method === "DELETE") {
          Object.entries(body).forEach(([key, value]) => {
            url.searchParams.append(key, value.toString());
          });
          return fetch(url.toString(), { method, headers }).then(
            responseHandler
          );
        }
        headers["Content-Type"] = "application/json";
        return fetch(url.toString(), {
          method,
          body: JSON.stringify(body),
          headers,
        }).then(responseHandler);
      };

      const observation = !functionsByName[functionName]
        ? `Your last instruction was not one of the supported functions. Please use one of the functions I provide you for the next action.`
        : await invokeTool({
            body: functionArgs,
            ...apisByName[functionName],
          }).catch((e) => e.message);

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
    .where(eq(missionEvents.missionUuid, missionUuid))
    .orderBy(missionEvents.createdDate);
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
  const { documentId } = await vellum.documents.upload(
    fs.createReadStream(fileName),
    {
      label: missionLabel,
      addToIndexNames: ["padawan-missions"],
      externalId: missionUuid,
      keywords: [],
    }
  );
  // .catch((e) => console.error("Failed to upload document to vellum", e));
  await cxn
    .update(missions)
    .set({
      reportId: documentId,
    })
    .where(eq(missions.uuid, missionUuid));
  await cxn.end();
};

export default develop;
