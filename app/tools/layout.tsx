"use client";
import React from "react";
import Box from "@mui/material/Box";
import type { Response } from "../../api/tools/get";
import Paper from "@mui/material/Paper";
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import TablePagination from "@mui/material/TablePagination";

async function getTools() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tools`);
  const json = (await res.json()) as Response;
  return json.tools;
}

type Column = {
  id: "name" | "description" | "parameters" | "api" | "method";
  label: string;
  width?: number;
  align?: "right";
  format?: (value: unknown) => string;
};

const columns: Column[] = [
  { id: "name", label: "Name", width: 180 },
  { id: "description", label: "Description", width: 200 },
  {
    id: "parameters",
    label: "Parameters",
    width: 80,
    align: "right",
    format: (value) => (Array.isArray(value) ? value.length : 0).toString(),
  },
  { id: "api", label: "API", width: 160 },
  { id: "method", label: "Method", width: 60 },
];

const ToolLayout = ({ children }: { children: React.ReactNode }) => {
  const [tools, setTools] = React.useState<Response["tools"]>([]);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const handleChangePage = React.useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage);
    },
    [setPage]
  );

  const handleChangeRowsPerPage = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(+event.target.value);
      setPage(0);
    },
    [setPage, setRowsPerPage]
  );
  React.useEffect(() => {
    getTools().then(setTools);
  }, [setTools]);
  return (
    <Box display={"flex"} gap={"48px"}>
      <Box flexShrink={0}>
        <h2 className="text-xl">Toolset</h2>
        <Paper sx={{ width: "100%", overflow: "hidden" }}>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader aria-label="sticky table">
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align={column.align}
                      style={{
                        width: column.width,
                      }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody
                sx={{
                  "& .MuiTableCell-root": {
                    overflowWrap: "anywhere",
                  },
                }}
              >
                {tools
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((row) => {
                    return (
                      <TableRow
                        hover
                        role="checkbox"
                        tabIndex={-1}
                        key={row.uuid}
                        sx={{
                          cursor: "pointer",
                        }}
                      >
                        {columns.map((column) => {
                          const value = row[column.id];
                          return (
                            <TableCell key={column.id} align={column.align}>
                              {column.format
                                ? column.format(value)
                                : typeof value === "string"
                                ? value
                                : "[unknown value]"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 100]}
            component="div"
            count={tools.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      </Box>
      <Box flexGrow={"1"} overflow={"auto"} paddingY={4}>
        {children}
      </Box>
    </Box>
  );
};

export default ToolLayout;
