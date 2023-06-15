"use server";

import { eq } from "drizzle-orm";
import { missionEvents, missionSteps, missions } from "scripts/schema";
import drizzle from "src/utils/drizzle";
import { redirect } from "next/navigation";

const deleteTool = async (args: FormData) => {
  const uuid = args.get("uuid") as string;
  if (!uuid) return;
  const cxn = drizzle();
  await cxn.delete(missionSteps).where(eq(missionSteps.missionUuid, uuid));
  await cxn.delete(missionEvents).where(eq(missionEvents.missionUuid, uuid));
  await cxn.delete(missions).where(eq(missions.uuid, uuid));
  await cxn.end();
  redirect("/missions");
};

export default deleteTool;
