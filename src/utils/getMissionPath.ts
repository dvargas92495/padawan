import path from "path";
import os from "os";

const getMissionPath = (missionUuid: string) => {
  return path.join(process.env.FILE_STORAGE_PATH || os.tmpdir(), missionUuid);
};

export default getMissionPath;
