"use client";
import React, { useEffect } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import deleteMission from "app/actions/deleteMission";
import getMission from "app/actions/getMission";
import { z } from "zod";
import Typography from "@mui/material/Typography";

const REFRESH_INTERVAL = 1000 * 15;

type Mission = Awaited<ReturnType<typeof getMission>>;

const PadawanMissionStep = ({
  step,
  index,
}: {
  step: Mission["steps"][number];
  index: number;
}) => {
  const [showGeneration, setShowGeneration] = React.useState(false);
  return !step ? (
    <Box>Step {index + 1} Failed to load...</Box>
  ) : (
    <Paper elevation={3}>
      <h1 className="font-semibold text-lg mb-4">Step {index + 1}</h1>
      {/* <Typography variant="subtitle1">{step.thought}</Typography>
      <Typography variant="subtitle1">
        <b>{step.action}:</b> <code>{step.actionInput}</code>
      </Typography>
      <Typography variant="subtitle1">
        Executed on {new Date(step.date).toLocaleString()}. Observation:
      </Typography>
      <Typography variant="subtitle1">{step.observation}</Typography> */}
      {showGeneration ? (
        <pre className="mt-4 rounded-2xl border shadow-lg bg-slate-300 relative p-4 overflow-hidden whitespace-break-spaces">
          <span
            className="absolute right-4 top-4 h-8 w-8 bg-red-500 cursor-pointer rounded-full flex items-center justify-center text-white"
            onClick={() => setShowGeneration(false)}
          >
            x
          </span>
          {/* <code>{step.generation}</code> */}
        </pre>
      ) : (
        <Typography
          sx={{ textDecorationLine: "underline", cursor: "pointer" }}
          variant={"body2"}
          onClick={() => setShowGeneration(true)}
        >
          More info
        </Typography>
      )}
    </Paper>
  );
};

const MissionPage = ({ params }: { params: { uuid: string } }) => {
  const [mission, setMission] = React.useState<Awaited<
    ReturnType<typeof getMission>
  > | null>(null);
  const refresh = React.useCallback(
    () => getMission(params).then(setMission),
    [setMission, params]
  );
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const [now, setNow] = React.useState(() => new Date());
  const [nextRefresh, setNextRefresh] = React.useState(
    now.valueOf() + REFRESH_INTERVAL
  );
  useEffect(() => {
    // TODO - replace with server-sent events
    if (mission?.status !== "FINISHED") {
      const interval = setInterval(() => {
        setNextRefresh(new Date().valueOf() + REFRESH_INTERVAL);
        refresh();
      }, REFRESH_INTERVAL);
      const nowInterval = setInterval(() => {
        setNow(new Date());
      }, 500);
      return () => {
        clearInterval(interval);
        clearInterval(nowInterval);
      };
    }
    return () => {};
  }, [mission?.status, refresh]);
  console.log(mission);
  return (
    <Box>
      {mission && (
        <Box>
          <h1>
            {mission.label} [{mission.status}]
          </h1>
          <p>
            <>
              Next refresh in{" "}
              {Math.floor((nextRefresh.valueOf() - now.valueOf()) / 1000)}
            </>
          </p>
          <Box flexGrow={1} display={"flex"} flexDirection={"column"} gap={8}>
            {mission.steps.map((step, index) => (
              <PadawanMissionStep step={step} key={index} index={index} />
            ))}
            {mission.report && (
              <Box
                marginTop={2}
                borderRadius={12}
                padding={4}
                whiteSpace={"break-spaces"}
                bgcolor={"#f0f0f0"}
              >
                <h2 className="mb-2 text-xl font-bold">Mission Report</h2>
                <div>{mission.report}</div>
              </Box>
            )}
          </Box>
        </Box>
      )}
      <Box
        display={"flex"}
        justifyContent={"space-between"}
        alignItems={"center"}
      >
        <form action={deleteMission}>
          <input type="hidden" name="uuid" value={params.uuid} />
          <Button variant="contained" color="warning" type="submit">
            Delete
          </Button>
        </form>
        <Button href="/missions">Back</Button>
      </Box>
    </Box>
  );
};

export default MissionPage;
