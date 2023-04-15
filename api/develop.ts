import type { Handler } from "aws-lambda";
import { z } from "zod";

const zArgs = z.object({
  issue: z.number(),
  owner: z.string(),
  repo: z.string(),
});

const develop: Handler = (evt: unknown) => {
  const { issue } = zArgs.parse(evt);
  console.log("working on", issue);
};

export default develop;
