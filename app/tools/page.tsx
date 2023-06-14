"use client";
import React from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import IconButton from "@mui/material/IconButton";
import { v4 } from "uuid";
import createTool from "../actions/createTool";

const MultiField = ({
  label,
  name,
  FieldSet,
}: {
  label: React.ReactNode;
  name: string;
  FieldSet: (props: { onRemove: () => void }) => JSX.Element;
}) => {
  const [keys, setKeys] = React.useState<string[]>([]);
  const onRemove = React.useCallback(
    (key: string) => setKeys((ks) => ks.filter((k) => k !== key)),
    [setKeys]
  );
  return (
    <Box>
      <FormLabel component="legend">
        {label}
        <IconButton
          onClick={() => setKeys([...keys, v4()])}
          sx={{ marginLeft: 4 }}
        >
          <AddIcon />
        </IconButton>
      </FormLabel>
      <FormGroup>
        {keys.map((key) => {
          return (
            <Box
              component={"fieldset"}
              name={name}
              key={key}
              sx={{ marginTop: 2 }}
            >
              <FormLabel component="legend">{name}</FormLabel>
              <FieldSet onRemove={() => onRemove(key)} />
            </Box>
          );
        })}
      </FormGroup>
    </Box>
  );
};

export default function Page() {
  return (
    <Box
      display={"flex"}
      flexDirection={"column"}
      gap={"16px"}
      component={"form"}
      action={createTool}
    >
      <TextField label={"Name"} name={"name"} />
      <TextField
        label={"Description"}
        name={"description"}
        multiline
        rows={4}
      />
      <TextField label={"API"} name={"api"} />
      <Select defaultValue={"GET"} label="Method" name={"method"}>
        <MenuItem value={"GET"}>GET</MenuItem>
        <MenuItem value={"POST"}>POST</MenuItem>
        <MenuItem value={"PUT"}>PUT</MenuItem>
        <MenuItem value={"DELETE"}>DELETE</MenuItem>
      </Select>
      <MultiField
        label={"Parameters"}
        name={"parameters"}
        FieldSet={({ onRemove }) => (
          <FormGroup row sx={{ gap: 2 }}>
            <TextField name={`parameters.name`} label={"Name"} />
            <TextField
              name={`parameters.description`}
              label={"Description"}
              sx={{ flexGrow: 1 }}
            />
            <Select
              defaultValue={"string"}
              label="Type"
              name={`parameters.type`}
            >
              <MenuItem value={"string"}>string</MenuItem>
              <MenuItem value={"boolean"}>boolean</MenuItem>
              <MenuItem value={"number"}>number</MenuItem>
            </Select>
            <IconButton sx={{ marginLeft: 4 }} onClick={onRemove}>
              <DeleteIcon />
            </IconButton>
          </FormGroup>
        )}
      />
      <Button type={"submit"} variant="contained">
        Create
      </Button>
    </Box>
  );
}
