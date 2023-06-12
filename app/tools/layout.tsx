import React from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";

const ToolLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex gap-12">
      <div className="flex flex-col gap-8 max-w-3xl w-full flex-shrink-0">
        <form method="post">
          <TextField label={"Name"} name={"name"} />
          <TextField label={"Description"} name={"description"} />
          <TextField label={"logic"} name={"Logic"} />
          <Button type={"submit"}>Create</Button>
        </form>
        <h2 className="text-xl">Toolset</h2>
        {/* <Table onRowClick={"uuid"} /> */}
      </div>
      <div className="flex-grow overflow-auto">{children}</div>
    </div>
  );
};

export default ToolLayout;
