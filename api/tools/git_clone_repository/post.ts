import createAPIGatewayProxyHandler from "@samepage/backend/createAPIGatewayProxyHandler";
import { ChildProcess, execSync } from "child_process";
import path from "path";
import os from "os";

const logic = ({
  url,
  ["x-padawan-mission"]: missionUuid,
}: {
  url: string;
  "x-padawan-mission": string;
}) => {
  try {
    execSync(
      `git clone ${url} ${path.join(
        process.env.FILE_STORAGE_PATH || os.tmpdir(),
        missionUuid
      )}`
    );
    return { success: true, alreadyExisted: false };
  } catch (e) {
    if (e instanceof ChildProcess && e.stderr) {
      const err = e.stderr.toString();
      if (
        /^fatal: destination path '[^']+' already exists and is not an empty directory/.test(
          err
        )
      ) {
        return { success: true, alreadyExisted: true };
      }
      return { success: false, error: err };
    } else if (e instanceof Error) {
      return { success: false, error: e.message };
    }
    return { success: false, error: "Unknown error occurred." };
  }
};

export default createAPIGatewayProxyHandler({
  logic,
  includeHeaders: ["x-padawan-mission"],
});
