"use client";
import React from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { v4 } from "uuid";

export default function Page() {
  return (
    <Box
      component={"form"}
      display={"flex"}
      flexDirection={"column"}
      gap={"16px"}
      alignItems={"start"}
      maxWidth={512}
    >
      <h2>New Mission</h2>
      <TextField
        label={"Owner"}
        name={"owner"}
        defaultValue={"dvargas92495"}
        fullWidth
      />
      <TextField
        label={"Repository"}
        name={"repo"}
        fullWidth
        defaultValue={"roamjs-smartblocks"}
      />
      <TextField
        type={"number"}
        label={"Issue Number"}
        name={"issue"}
        fullWidth
        defaultValue={63}
      />
      <TextField
        label={"Label"}
        name={"label"}
        fullWidth
        defaultValue={`Padawan Mission ${v4().slice(0, 8)}`}
      />
      <Button type={"submit"} variant="contained">
        Assign
      </Button>
    </Box>
  );
}
