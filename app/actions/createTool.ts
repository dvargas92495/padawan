"use server";
import {
  tools,
  METHODS,
  METHOD,
  toolParameters,
  PARAMETER_TYPES,
  PARAMETER_TYPE,
} from "../../scripts/schema";
import drizzle from "../../src/utils/drizzle";
import { v4 } from "uuid";
import { redirect } from "next/navigation";

const createTool = async (args: FormData) => {
  const toolUuid = v4();
  const nameArg = args.get("name");
  const name = typeof nameArg === "string" ? nameArg : "";
  const descriptionArg = args.get("description");
  const apiArg = args.get("api");
  const methodArg = args.get("method");
  const cxn = drizzle();
  await cxn.insert(tools).values({
    uuid: toolUuid,
    name,
    description: typeof descriptionArg === "string" ? descriptionArg : "",
    api: typeof apiArg === "string" ? apiArg : "",
    method: METHODS.includes(methodArg as METHOD)
      ? (methodArg as METHOD)
      : "GET",
    createdDate: new Date(),
    updatedDate: new Date(),
  });

  const parameterNames = args.getAll("parameters.name");
  if (parameterNames.length) {
    const parameterDescriptions = args.getAll("parameters.description");
    const parameterTypes = args.getAll("parameters.type");
    await cxn.insert(toolParameters).values(
      parameterNames.map((name, index) => {
        const parameterType = parameterTypes[index];
        const description = parameterDescriptions[index];
        return {
          uuid: v4(),
          toolUuid,
          name: typeof name === "string" ? name : "",
          description: typeof description === "string" ? description : "",
          type: PARAMETER_TYPES.includes(parameterType as PARAMETER_TYPE)
            ? (parameterType as PARAMETER_TYPE)
            : "string",
          createdDate: new Date(),
          updatedDate: new Date(),
        };
      })
    );
  }
  await cxn.end();
  redirect(`/tools/${toolUuid}`);
};

export default createTool;
