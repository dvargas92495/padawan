"use client";
import React, { useEffect } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import deleteMission from "app/actions/deleteMission";
import getMission from "app/actions/getMission";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";

const REFRESH_INTERVAL = 1000 * 5;

type Mission = Awaited<ReturnType<typeof getMission>>;

const PadawanMissionStep = ({
  step,
  index,
}: {
  step: Mission["steps"][number];
  index: number;
}) => {
  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      <Typography variant={"h5"}>
        Step {index + 1} - {step.functionName}
      </Typography>
      <List>
        {Object.entries(JSON.parse(step.functionArgs)).map(([key, value]) => (
          <ListItem key={key} sx={{ my: 0, py: 0 }}>
            <ListItemText primary={`${key}: ${value}`} />
          </ListItem>
        ))}
      </List>

      <Typography variant="subtitle2">
        Executed on {new Date(step.executionDate).toLocaleString()}.
        Observation:
      </Typography>
      <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
        {step.observation}
      </Typography>
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
    if (!mission?.report) {
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
  }, [mission?.report, refresh]);
  return (
    <Box>
      {mission && (
        <Box>
          <Typography variant={"h2"}>{mission.label}</Typography>
          {!mission.report && (
            <Typography variant={"subtitle2"}>
              Next refresh in{" "}
              {Math.floor((nextRefresh.valueOf() - now.valueOf()) / 1000)}
            </Typography>
          )}
          <Box
            flexGrow={1}
            display={"flex"}
            flexDirection={"column"}
            gap={8}
            marginTop={4}
          >
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
        marginTop={2}
      >
        <Box display={"flex"} alignItems={"center"} gap={2}>
          <Button
            href={`/missions/${params.uuid}/report`}
            LinkComponent={Link}
            variant={"contained"}
            color={"info"}
          >
            Report
          </Button>
          <form action={deleteMission}>
            <input type="hidden" name="uuid" value={params.uuid} />
            <Button variant="contained" color="warning" type="submit">
              Delete
            </Button>
          </form>
        </Box>
        <Button href="/missions">Back</Button>
      </Box>
    </Box>
  );
};

export default MissionPage;
