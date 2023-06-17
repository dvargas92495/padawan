"use server";
import { tokens } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { v4 } from "uuid";
import { redirect } from "next/navigation";

const createToken = async (args: FormData) => {
  const domainArg = args.get("domain");
  const domain = typeof domainArg === "string" ? domainArg : "";
  const tokenArg = args.get("token");
  const cxn = drizzle();
  await cxn.insert(tokens).values({
    uuid: v4(),
    domain,
    token: typeof tokenArg === "string" ? tokenArg : "",
    createdDate: new Date(),
    updatedDate: new Date(),
  });

  await cxn.end();
  redirect(`/tokens`);
};

export default createToken;
