import createAPIGatewayHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { v4 } from "uuid";
import { METHOD, PARAMETER_TYPE, tools, toolParameters } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { eq, sql } from "drizzle-orm";

const logic = async () => {
  const cxn = drizzle();
  const records = await cxn
    .select({
      uuid: tools.uuid,
      name: sql<string>`min(${tools.name})`,
      description: sql<string>`min(${tools.description})`,
      api: sql<string>`min(${tools.api})`,
      method: sql<METHOD>`min(${tools.method})`,
      parameters: sql<number>`COUNT(${toolParameters.uuid})`,
    })
    .from(tools)
    .leftJoin(toolParameters, eq(tools.uuid, toolParameters.toolUuid))
    .groupBy(tools.uuid);
  await cxn.end();
  return {
    tools: records,
  };
};

export type Response = Awaited<ReturnType<typeof logic>>;

export default createAPIGatewayHandler(logic);
