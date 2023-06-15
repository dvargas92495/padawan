"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { v4 } from "uuid";
import drizzle from "src/utils/drizzle";
import { missions } from "scripts/schema";

const zData = z.object({
  owner: z.string(),
  repo: z.string(),
  label: z.string(),
  issue: z.string().transform((v) => Number(v)),
});

const startTool = async (data: FormData) => {
  const { owner, repo, issue, label } = zData.parse(
    Object.fromEntries(data.entries())
  );
  const missionUuid = v4();
  const cxn = drizzle();
  await cxn.insert(missions).values({
    uuid: missionUuid,
    label,
    startDate: new Date(),
  });
  await cxn.end();
  await fetch(`http://localhost:3001/develop`, {
    method: "POST",
    body: JSON.stringify({
      owner,
      repo,
      issue,
      type: "User",
      missionUuid,
    }),
  });
  redirect(`/missions/${missionUuid}`);
};

export default startTool;
