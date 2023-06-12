import React from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { v4 } from "uuid";

const MissionLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex gap-12">
      <div className="flex flex-col gap-8 max-w-3xl w-full flex-shrink-0">
        <form method="post">
          <TextField
            label={"Owner"}
            name={"owner"}
            defaultValue={"dvargas92495"}
          />
          <TextField
            label={"Repository"}
            name={"repo"}
            defaultValue={"roamjs-smartblocks"}
          />
          <TextField
            type={"number"}
            label={"Issue Number"}
            name={"issue"}
            defaultValue={63}
          />
          <TextField
            label={"Label"}
            name={"label"}
            defaultValue={`Padawan Mission ${v4().slice(0, 8)}`}
          />
          <Button type={"submit"}>Assign</Button>
        </form>
        <h2 className="text-xl">Past Missions</h2>
        {/* <Table onRowClick={"uuid"} /> */}
      </div>
      <div className="flex-grow overflow-auto">{children}</div>
    </div>
  );
};

export default MissionLayout;
