"use client";
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import deleteTool from "app/actions/deleteTool";
import getTool from "app/actions/getTool";
import deleteToolParameter from "app/actions/deleteToolParameter";

const ToolPage = ({ params }: { params: { uuid: string } }) => {
  const [tool, setTool] = React.useState<Awaited<
    ReturnType<typeof getTool>
  > | null>(null);
  React.useEffect(() => {
    getTool(params).then(setTool);
  }, [setTool, params.uuid]);
  return (
    <Box>
      <h2>{params.uuid}</h2>
      {tool && (
        <Box>
          <h2>Parameters</h2>
          <List>
            {tool.parameters.map((parameter) => (
              <ListItemButton key={parameter.uuid}>
                <ListItemText
                  primary={
                    <Box>
                      {parameter.name} - ({parameter.type}){" "}
                      {parameter.description}
                    </Box>
                  }
                />
                <form action={deleteToolParameter}>
                  <input type="hidden" name="uuid" value={parameter.uuid} />
                  <IconButton type={"submit"} title={"Delete"}>
                    <DeleteIcon />
                  </IconButton>
                </form>
              </ListItemButton>
            ))}
          </List>
        </Box>
      )}
      <form action={deleteTool}>
        <input type="hidden" name="uuid" value={params.uuid} />
        <Button variant="contained" color="warning" type="submit">
          Delete
        </Button>
      </form>
    </Box>
  );
};

export default ToolPage;
