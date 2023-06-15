"use client";
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import deleteTool from "app/actions/deleteTool";

const ToolPage = ({ params }: { params: Record<string, string> }) => {
  return (
    <Box>
      <h2>{params.uuid}</h2>
      <Button
        variant="contained"
        color="warning"
        component={React.forwardRef(
          (
            props: React.DetailedHTMLProps<
              React.ButtonHTMLAttributes<HTMLButtonElement>,
              HTMLButtonElement
            >,
            ref: React.LegacyRef<HTMLButtonElement>
          ) => (
            // does nothing without a form
            <button {...props} ref={ref} formAction={deleteTool} />
          )
        )}
      >
        Delete
      </Button>
    </Box>
  );
};

export default ToolPage;
