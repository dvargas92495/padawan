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
import TextField, { TextFieldProps } from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Select from "@mui/material/Select";
import AddIcon from "@mui/icons-material/Add";
import { PARAMETER_TYPES } from "scripts/schema";
import MenuItem from "@mui/material/MenuItem";
import updateToolParameter from "app/actions/updateToolParameter";
import updateToolFormat from "app/actions/updateToolFormat";
import type { Variant } from "@mui/material/styles/createTypography";
import updateToolApi from "app/actions/updateToolApi";
import createToolParameter from "app/actions/createToolParameter";
import updateToolDescription from "app/actions/updateToolDescription";
import FormLabel from "@mui/material/FormLabel";
import testTool from "app/actions/testTool";

const EditableField = ({
  label,
  defaultValue,
  uuid,
  updateAction,
  variant,
  fontFamily,
  TextFieldProps = {},
}: {
  label: string;
  updateAction: (req: FormData) => Promise<void>;
  defaultValue: string;
  uuid: string;
  variant: Variant;
  fontFamily?: string;
  TextFieldProps?: TextFieldProps;
}) => {
  const [isEdit, setIsEditing] = React.useState(false);
  return isEdit ? (
    <Box component={"form"} marginBottom={4} action={updateAction}>
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
        {...TextFieldProps}
      />
    </Box>
  ) : (
    <>
      {!/^h[1-6]$/.test(variant) && (
        <FormLabel component="legend" sx={{ marginBottom: 2 }}>
          {label}
        </FormLabel>
      )}
      <Typography
        variant={variant}
        sx={{
          cursor: "pointer",
          "&:hover": { bgcolor: "#eeeeee" },
          marginBottom: 4,
          whiteSpace: "pre-wrap",
          fontFamily,
        }}
        onClick={() => setIsEditing(true)}
      >
        {defaultValue || <i style={{ opacity: 0.5 }}>Click to edit</i>}
      </Typography>
    </>
  );
};

const ToolPage = ({ params }: { params: { uuid: string } }) => {
  const [tool, setTool] = React.useState<Awaited<
    ReturnType<typeof getTool>
  > | null>(null);
  React.useEffect(() => {
    getTool(params).then(setTool);
  }, [setTool, params.uuid]);
  const [newParameterOpen, setNewParameterOpen] = React.useState(false);
  const closeNewParameterDialog = React.useCallback(
    () => setNewParameterOpen(false),
    [setNewParameterOpen]
  );
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
          <EditableField
            defaultValue={tool.description}
            uuid={tool.uuid}
            updateAction={updateToolDescription}
            label={"Description"}
            variant="body1"
          />
          <EditableField
            defaultValue={tool.api}
            uuid={tool.uuid}
            updateAction={updateToolApi}
            fontFamily="monospace"
            label={"API"}
            variant="body2"
          />
          <FormLabel component="legend">
            Parameters
            <IconButton
              onClick={() => setNewParameterOpen(true)}
              sx={{ marginLeft: 4 }}
            >
              <AddIcon />
            </IconButton>
          </FormLabel>
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
            fontFamily="monospace"
            TextFieldProps={{
              multiline: true,
              minRows: 2,
            }}
          />
          <Dialog open={newParameterOpen} onClose={closeNewParameterDialog}>
            <form action={createToolParameter}>
              <DialogTitle>Add Parameter</DialogTitle>
              <DialogContent>
                <input type="hidden" name="uuid" value={tool.uuid} />
                <TextField
                  name={`name`}
                  label={"Name"}
                  sx={{ marginTop: 2, marginRight: 2, flexGrow: 1 }}
                />
                <Select
                  label="Type"
                  name={`type`}
                  sx={{ marginTop: 2 }}
                  defaultValue={PARAMETER_TYPES[0]}
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
                  multiline
                  minRows={4}
                  sx={{ marginTop: 2 }}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={closeNewParameterDialog}>Cancel</Button>
                <Button type={"submit"}>Save</Button>
              </DialogActions>
            </form>
          </Dialog>
          <Dialog
            open={!!editingParameterUuid}
            onClose={closeEditParameterDialog}
          >
            <form action={updateToolParameter}>
              <DialogTitle>Edit Parameter</DialogTitle>
              <DialogContent>
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
                  multiline
                  minRows={4}
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
        <Box display={"flex"} gap={2} alignItems={"center"}>
          <form action={testTool}>
            <input type="hidden" name="uuid" value={params.uuid} />
            <Button variant="contained" type={"submit"}>
              Test
            </Button>
          </form>
          <form action={deleteTool}>
            <input type="hidden" name="uuid" value={params.uuid} />
            <Button variant="contained" color="warning" type="submit">
              Delete
            </Button>
          </form>
        </Box>
        <Button href="/tools">Back</Button>
      </Box>
    </Box>
  );
};

export default ToolPage;
