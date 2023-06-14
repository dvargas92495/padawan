"use client";
import React from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";

const ToolLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex gap-12">
      <div className="flex flex-col gap-8 max-w-3xl w-full flex-shrink-0">
        <Box
          method="post"
          sx={{ display: "flex", flexDirection: "column", gap: 4 }}
          component={"form"}
        >
          <TextField label={"Name"} name={"name"} />
          <TextField
            label={"Description"}
            name={"description"}
            multiline
            rows={4}
          />
          <TextField label={"Logic"} name={"logic"} multiline rows={4} />
          <Button type={"submit"} variant="contained">
            Create
          </Button>
        </Box>
        <h2 className="text-xl">Toolset</h2>
        {/* <Table onRowClick={"uuid"} /> */}
      </div>
      <div className="flex-grow overflow-auto">{children}</div>
    </div>
  );
};

export default ToolLayout;
