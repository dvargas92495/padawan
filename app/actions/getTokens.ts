"use server";
import { tokens } from "scripts/schema";
import drizzle from "src/utils/drizzle";

const getTokens = async () => {
  const cxn = drizzle();
  const records = await cxn
    .select({
      uuid: tokens.uuid,
      domain: tokens.domain,
      token: tokens.token,
    })
    .from(tokens);
  await cxn.end();
  return {
    tokens: records,
  };
};

export type GetTokensResponse = Awaited<ReturnType<typeof getTokens>>;

export default getTokens;
