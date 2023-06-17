import { InferModel } from "drizzle-orm";
import { tools, toolParameters } from "scripts/schema";

type Tool = Omit<InferModel<typeof tools>, "createdDate" | "updatedDate">;
type ToolParameter = Omit<
  InferModel<typeof toolParameters>,
  "createdDate" | "updatedDate" | "toolUuid"
>;
const getFunction = (tool: Tool & { parameters: ToolParameter[] }) => ({
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
});

export default getFunction;
