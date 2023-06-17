"use server";

import getTool from "./getTool";
import openai from "src/utils/openai";
import { GenerateResponse } from "vellum-ai/api";
import type { AxiosError } from "axios";
import getFunction from "src/utils/getFunction";

const testTool = async (args: FormData) => {
  console.log("testTool", args);
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const tool = await getTool({ uuid });
  if (!tool) return;
  const result = await openai()
    .createChatCompletion({
      stop: undefined,
      model: "gpt-3.5-turbo-0613",
      temperature: 0,
      n: 1,
      messages: [
        {
          role: "user",
          content:
            "Come up with an example usage of the function that I'm providing you.",
        },
      ],
      functions: [getFunction(tool)],
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
        return error(`Unknown Axios Data Error: ${JSON.stringify(data)}`);
      }
      return error(data.error.message);
    });
  console.log(JSON.stringify(result));
};

export default testTool;
