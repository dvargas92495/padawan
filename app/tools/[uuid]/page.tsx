"use client";
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import deleteTool from "app/actions/deleteTool";
import updateToolName from "app/actions/updateToolName";
import getTool from "app/actions/getTool";
import deleteToolParameter from "app/actions/deleteToolParameter";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Select from "@mui/material/Select";
import { PARAMETER_TYPES } from "scripts/schema";
import MenuItem from "@mui/material/MenuItem";
import updateToolParameter from "app/actions/updateToolParameter";
import updateToolFormat from "app/actions/updateToolFormat";
import type { Variant } from "@mui/material/styles/createTypography";
import updateToolApi from "app/actions/updateToolApi";

const EditableField = ({
  label,
  defaultValue,
  uuid,
  updateAction,
  variant,
}: {
  label: string;
  updateAction: (req: FormData) => Promise<void>;
  defaultValue: string;
  uuid: string;
  variant: Variant;
}) => {
  const [isEdit, setIsEditing] = React.useState(false);
  return isEdit ? (
    <form action={updateAction}>
      <input type="hidden" name="uuid" value={uuid} />
      <TextField
        name={label.toLowerCase()}
        label={label}
        fullWidth
        defaultValue={defaultValue}
        InputProps={{
          endAdornment: (
            <Box display={"flex"} gap={1} alignItems={"center"}>
              <IconButton type={"submit"} title={"Save"}>
                <SaveIcon />
              </IconButton>
              <IconButton onClick={() => setIsEditing(false)} title={"Cancel"}>
                <CancelIcon />
              </IconButton>
            </Box>
          ),
        }}
      />
    </form>
  ) : (
    <Typography
      variant={variant}
      sx={{ cursor: "pointer", "&:hover": { bgcolor: "#eeeeee" } }}
      onClick={() => setIsEditing(true)}
    >
      {defaultValue || "Click to edit"}
    </Typography>
  );
};

const ToolPage = ({ params }: { params: { uuid: string } }) => {
  const [tool, setTool] = React.useState<Awaited<
    ReturnType<typeof getTool>
  > | null>(null);
  React.useEffect(() => {
    getTool(params).then(setTool);
  }, [setTool, params.uuid]);
  const [editingParameterUuid, setEditingParameterUuid] = React.useState("");
  const closeEditParameterDialog = React.useCallback(
    () => setEditingParameterUuid(""),
    [setEditingParameterUuid]
  );
  const editingParameter = React.useMemo(
    () =>
      (tool?.parameters || []).find(
        (parameter) => parameter.uuid === editingParameterUuid
      ),
    [tool, editingParameterUuid]
  );
  return (
    <Box>
      {tool && (
        <Box>
          <EditableField
            defaultValue={tool.name}
            uuid={tool.uuid}
            updateAction={updateToolName}
            label={"Name"}
            variant="h2"
          />
          <Typography variant="body1">{tool.description}</Typography>
          <EditableField
            defaultValue={tool.api}
            uuid={tool.uuid}
            updateAction={updateToolApi}
            label={"API"}
            variant="body2"
          />
          <h2>Parameters</h2>
          <List>
            {tool.parameters.map((parameter) => (
              <ListItemButton
                key={parameter.uuid}
                onClick={() => setEditingParameterUuid(parameter.uuid)}
              >
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
          <EditableField
            defaultValue={tool.format}
            uuid={tool.uuid}
            updateAction={updateToolFormat}
            label={"Format"}
            variant={"body1"}
          />
          <Dialog
            open={!!editingParameterUuid}
            onClose={closeEditParameterDialog}
          >
            <form action={updateToolParameter}>
              <DialogTitle>Subscribe</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  To subscribe to this website, please enter your email address
                  here. We will send updates occasionally.
                </DialogContentText>
                <input type="hidden" name="uuid" value={editingParameterUuid} />
                <TextField
                  name={`name`}
                  label={"Name"}
                  sx={{ marginTop: 2, marginRight: 2, flexGrow: 1 }}
                  defaultValue={editingParameter?.name}
                />
                <Select
                  label="Type"
                  name={`type`}
                  sx={{ marginTop: 2 }}
                  defaultValue={editingParameter?.type}
                >
                  {PARAMETER_TYPES.map((pt) => (
                    <MenuItem value={pt} key={pt}>
                      {pt}
                    </MenuItem>
                  ))}
                </Select>
                <TextField
                  name={`description`}
                  label={"Description"}
                  fullWidth
                  sx={{ marginTop: 2 }}
                  defaultValue={editingParameter?.description}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={closeEditParameterDialog}>Cancel</Button>
                <Button type={"submit"}>Save</Button>
              </DialogActions>
            </form>
          </Dialog>
        </Box>
      )}
      <Box
        display={"flex"}
        justifyContent={"space-between"}
        alignItems={"center"}
        marginTop={4}
      >
        <form action={deleteTool}>
          <input type="hidden" name="uuid" value={params.uuid} />
          <Button variant="contained" color="warning" type="submit">
            Delete
          </Button>
        </form>
        <Button href="/tools">Back</Button>
      </Box>
    </Box>
  );
};

export default ToolPage;
