import { FC, ChangeEvent, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { SelectChangeEvent } from '@mui/material/Select';

import {
  Tooltip,
  Divider,
  Box,
  FormControl,
  InputLabel,
  Card,
  Checkbox,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TableContainer,
  Select,
  MenuItem,
  Typography,
  useTheme,
  CardHeader,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import Label from 'src/components/Label';
import BulkActions from './components/BulkActions';

interface Run {
  run_id: string;
  podcast_id: string;
  status: 'failed' | 'finished' | 'running' | string;
  model_name: string;
  is_llm: boolean;
  model_type: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
}

const API_HOST = process.env.REACT_APP_API_HOST;

const getStatusLabel = (status: string): JSX.Element => {
  const map: {
    [key: string]: {
      text: string;
      color:
        | 'error'
        | 'success'
        | 'warning'
        | 'primary'
        | 'black'
        | 'secondary'
        | 'info';
    };
  } = {
    failed: {
      text: 'Failed',
      color: 'error'
    },
    finished: {
      text: 'Finished',
      color: 'success'
    },
    running: {
      text: 'Training',
      color: 'warning'
    }
  };

  // Use a valid fallback color like 'primary'
  const { text, color } = map[status] || { text: status, color: 'primary' };

  return <Label color={color}>{text}</Label>;
};

const RecentOrdersTable: FC = () => {
  const [selectedRunForApi, setSelectedRunForApi] = useState<Run | null>(null);

  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [page, setPage] = useState<number>(0);
  const [limit, setLimit] = useState<number>(5);
  const [filters, setFilters] = useState<{ status?: string | null }>({
    status: null
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<Run | null>(null);
  const handleDeleteClick = (run: Run) => {
    setRunToDelete(run);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!runToDelete) return;

    try {
      const response = await fetch(`${API_HOST}/delete?podcast_id=${runToDelete.podcast_id}`, { method: 'GET' });

      if (!response.ok) throw new Error('Failed to delete');

      setRuns((prevRuns) => prevRuns.filter((run) => run.podcast_id !== runToDelete.podcast_id));
      console.log(`Deleted: ${runToDelete.podcast_id}`);
    } catch (error) {
      console.error('Error deleting:', error);
    }

    setDeleteDialogOpen(false);
    setRunToDelete(null);
  };

  // Replace with actual user retrieval logic
  const [user, setUser] = useState<{
    id: number;
    name: string;
    email: string;
    picture: string;
  } | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    const fetchRuns = async () => {
      if (!user?.email) return;
      try {
        const response = await fetch(`${API_HOST}/run_list?email=${user.email}`);
        if (!response.ok) {
          console.error('Failed to fetch runs');
          return;
        }
        const data = await response.json();
        setRuns(data);
      } catch (error) {
        console.error('Error fetching runs:', error);
      }
    };

    fetchRuns();
  }, [user?.email]);

  const applyFilters = (
    runs: Run[],
    filters: { status?: string | null }
  ): Run[] => {
    return runs.filter((run) => {
      let matches = true;
      if (filters.status && run.status !== filters.status) {
        matches = false;
      }
      return matches;
    });
  };

  const applyPagination = (runs: Run[], page: number, limit: number): Run[] => {
    return runs.slice(page * limit, page * limit + limit);
  };

  const statusOptions = [
    { id: 'all', name: 'All' },
    { id: 'finished', name: 'finished' },
    { id: 'running', name: 'running' },
    { id: 'failed', name: 'failed' }
  ];

  const handleStatusChange = (e: SelectChangeEvent<string>): void => {
    let value: string | null = null;
    const val = e.target.value;
    if (val !== 'all') {
      value = val;
    }
    setFilters((prev) => ({
      ...prev,
      status: value
    }));
  };

  const handleTrainMore = (run: Run) => {
    window.location.href = `/task-llm?retrain=retrain&model_id=${run.podcast_id}`;
  };

  const handleSelectAllRuns = (event: ChangeEvent<HTMLInputElement>): void => {
    setSelectedRuns(
      event.target.checked ? runs.map((run) => run.run_id) : []
    );
  };

  const handleSelectOneRun = (
    event: ChangeEvent<HTMLInputElement>,
    runId: string
  ): void => {
    if (!selectedRuns.includes(runId)) {
      setSelectedRuns((prev) => [...prev, runId]);
    } else {
      setSelectedRuns((prev) => prev.filter((id) => id !== runId));
    }
  };

  const handlePageChange = (event: unknown, newPage: number): void => {
    setPage(newPage);
  };

  const handleLimitChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setLimit(parseInt(event.target.value, 10));
  };

  const filteredRuns = applyFilters(runs, filters);
  const paginatedRuns = applyPagination(filteredRuns, page, limit);
  const selectedSomeRuns =
    selectedRuns.length > 0 && selectedRuns.length < runs.length;
  const selectedAllRuns = selectedRuns.length === runs.length;
  const theme = useTheme();

//   const renderApiDocumentation = (run: Run): JSX.Element => {
//     const bEndpoint = `https://console.vais.app/api/{method}/{model_id}`
//     const baseUrl = `https://console.vais.app/api/inference/${run.podcast_id}`;
//     const baseUrlB64 = `https://console.vais.app/api/inference_b64/${run.podcast_id}`;
//     return (
//       <Box>
//         <Box display="flex" alignItems="center" gap={1} mb={2}>
//           <InfoTwoToneIcon color="primary" />
//           <Typography variant="h6">Interactive API Documentation</Typography>
//         </Box>

//         <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
//           Base Endpoint:
//         </Typography>
//         <Typography variant="body2" sx={{ mb: 2 }}>
//           <code>{bEndpoint}</code>
//         </Typography>

//         <Typography variant="body2" sx={{ mb: 2 }}>
//           <strong>Optional Parameters (for both endpoints)</strong>
//           <ul>
//             <li>
//               <strong>temperature</strong> (float) — default <code>0.5</code>
//             </li>
//             <li>
//               <strong>max_tokens</strong> (integer) — default <code>500</code>
//             </li>
//           </ul>
//           These can be used to control how the underlying language model behaves:
//           <br />
//           - <em>temperature</em> determines the randomness (0.5 = deterministic).
//           <br />
//           - <em>max_tokens</em> sets the max number of tokens in the output.
//         </Typography>

//         <Divider sx={{ my: 2 }} />

//         {/* /inference */}
//         <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
//           1. POST /inference/
//         </Typography>
//         <Typography variant="body2" sx={{ mb: 1 }}>
//           <strong>Description:</strong> Sends a multipart/form-data request with
//           an <code>input</code> (text prompt) and an <code>image</code> (file).
//           Optional <code>temperature</code> and <code>max_tokens</code> can also
//           be passed as form fields.
//         </Typography>

//         <Typography variant="body2" component="div" sx={{ mb: 2 }}>
//           <strong>Example cURL:</strong>
//           <Box
//             component="pre"
//             sx={{
//               backgroundColor: theme.palette.background.paper,
//               color: theme.palette.text.primary,
//               padding: 1,
//               borderRadius: 1,
//               mt: 1,
//               overflowX: 'auto'
//             }}
//           >
//             {`curl -X POST \\
//   -F "input=Describe the attached image" \\
//   -F "image=@path/to/local_image.jpg" \\
//   -F "temperature=0.5" \\
//   -F "max_tokens=500" \\
//   ${baseUrl}`}
//           </Box>
//         </Typography>

//         <Typography variant="body2" component="div" sx={{ mb: 2 }}>
//           <strong>Example Postman:</strong>
//           <Box
//             component="pre"
//             sx={{
//               backgroundColor: theme.palette.background.paper,
//               color: theme.palette.text.primary,
//               padding: 1,
//               borderRadius: 1,
//               mt: 1,
//               overflowX: 'auto'
//             }}
//           >
//               {`POST ${baseUrl}
// Headers:
//   Content-Type: multipart/form-data

// Body (form-data):
//   input: "Describe the attached image"
//   image: (file) path/to/local_image.jpg
//   temperature (optional): 0.5
//   max_tokens (optional): 500
// `}
//           </Box>
//         </Typography>

//         <Divider sx={{ my: 2 }} />

//         {/* /inference_b64 */}
//         <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
//           2. POST /inference_b64/
//         </Typography>
//         <Typography variant="body2" sx={{ mb: 1 }}>
//           <strong>Description:</strong> Sends a JSON request with an{' '}
//           <code>input</code> (text prompt) and an <code>image</code> in base64
//           format. Optional <code>temperature</code> and <code>max_tokens</code>{' '}
//           can be passed in the JSON body as well.
//         </Typography>

//         <Typography variant="body2" component="div" sx={{ mb: 2 }}>
//           <strong>Example cURL:</strong>
//           <Box
//             component="pre"
//             sx={{
//               backgroundColor: theme.palette.background.paper,
//               color: theme.palette.text.primary,
//               padding: 1,
//               borderRadius: 1,
//               mt: 1,
//               overflowX: 'auto'
//             }}
//           >
//             {`curl -X POST -H "Content-Type: application/json" \\
//   -d '{
//     "input": "Describe this base64-encoded image",
//     "image": "<BASE64_ENCODED_IMAGE>",
//     "temperature": 0.5,
//     "max_tokens": 500
//   }' \\
//   ${baseUrlB64}`}
//           </Box>
//         </Typography>

//         <Typography variant="body2" component="div" sx={{ mb: 2 }}>
//           <strong>Example Postman:</strong>
//           <Box
//             component="pre"
//             sx={{
//               backgroundColor: theme.palette.background.paper,
//               color: theme.palette.text.primary,
//               padding: 1,
//               borderRadius: 1,
//               mt: 1,
//               overflowX: 'auto'
//             }}
//           >
//             {`POST ${baseUrlB64}
// Headers:
//   Content-Type: application/json

// Body (raw JSON):
// {
//   "input": "Describe this base64-encoded image",
//   "image": "<BASE64_ENCODED_IMAGE>",
//   "temperature": 0.5,
//   "max_tokens": 500
// }
// `}
//           </Box>
//         </Typography>
//       </Box>
//     );
//   };

const renderApiDocumentation = (run: Run): JSX.Element => {
  const theme = useTheme();

  // Check if the model is an LLM (i.e. not a VLM)
  if (run.is_llm) {
    // Construct the base URL for the LLM endpoint
    const baseUrlLLM = `https://console.vais.app/api/inference-llm/${run.podcast_id}`;
    const baseUrlLLMStream = `https://console.vais.app/api/inference-llm/stream/${run.podcast_id}`;

    return (
      <Box>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <InfoTwoToneIcon color="primary" />
          <Typography variant="h6">
            Interactive API Documentation — LLM Endpoint
          </Typography>
        </Box>

        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
          Base Endpoints:
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          <code>{baseUrlLLM}</code> (standard, non-streaming) <br />
          <code>{baseUrlLLMStream}</code> (streaming)
        </Typography>

        <Typography variant="body2" sx={{ mb: 2 }}>
          <strong>Optional Parameters</strong>:
          <ul>
            <li>
              <strong>temperature</strong> (float) — default <code>0.5</code>
            </li>
            <li>
              <strong>max_tokens</strong> (integer) — default <code>500</code>
            </li>
          </ul>
          Use these to adjust the model's response randomness and output length.
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* /inference-llm endpoint */}
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          1. POST /inference-llm/
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>Description:</strong> Sends a JSON request containing an{' '}
          <code>input</code> (text prompt) and a required <code>model_type</code>{' '}
          parameter. Optional parameters <code>temperature</code> and{' '}
          <code>max_tokens</code> control the response behavior. This endpoint
          blocks until the entire response is generated and then returns the
          result.
        </Typography>

        <Typography variant="body2" sx={{ mb: 2 }}>
          Note: This endpoint <strong>only accepts JSON</strong> requests.
        </Typography>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>Example cURL:</strong>
          <Box
            component="pre"
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              padding: 1,
              borderRadius: 1,
              mt: 1,
              overflowX: 'auto'
            }}
          >
            {`curl -X POST -H "Content-Type: application/json" \\
-d '{
  "input": "Your text prompt here",
  "temperature": 0.5,
  "max_tokens": 500
}' \\
${baseUrlLLM}`}
          </Box>
        </Typography>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>Example Postman:</strong>
          <Box
            component="pre"
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              padding: 1,
              borderRadius: 1,
              mt: 1,
              overflowX: 'auto'
            }}
          >
              {`POST ${baseUrlLLM}
Headers:
  Content-Type: application/json

Body (raw JSON):
{
  "input": "Your text prompt here",
  "temperature": 0.5,
  "max_tokens": 500,
  "session_id": "default"
}`}
          </Box>
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* /inference-llm/stream endpoint */}
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          2. POST /inference-llm/stream/
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>Description:</strong> Similar to the above endpoint, but the
          response is returned in a <strong>stream</strong> (chunked) fashion,
          so you can process partial output tokens as they are generated. Useful
          for “live” output in a terminal or UI.
        </Typography>

        <Typography variant="body2" sx={{ mb: 2 }}>
          Note: This endpoint also <strong>only accepts JSON</strong> requests,
          but it may return partial tokens as they are generated (Server-Sent
          Events or raw chunked transfer). Usage is the same, but you must handle
          the streamed response on the client side.
        </Typography>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>Example cURL (stream):</strong>
          <Box
            component="pre"
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              padding: 1,
              borderRadius: 1,
              mt: 1,
              overflowX: 'auto'
            }}
          >
            {`curl -N -X POST -H "Content-Type: application/json" \\
-d '{
  "input": "Hello, streaming world!",
  "temperature": 0.5,
  "max_tokens": 500,
  "session_id": "default"
}' \\
${baseUrlLLMStream}`}
          </Box>
          <Typography variant="body2" sx={{ mb: 0 }}>
            The <code>-N</code> flag in <strong>curl</strong> tells it not to
            buffer the response, so you see tokens as they arrive.
          </Typography>
        </Typography>
        <Divider sx={{ my: 2 }} />

      {/* /create-session */}
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        3. POST /create-session/
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        <strong>Description:</strong> This endpoint creates a new conversation session for stateful agent-mode inference. If you do not provide a <code>session_id</code> to the inference endpoint, a new one will be created automatically. However, you can explicitly call this to persist the session across multiple requests.
      </Typography>

      <Typography variant="body2" component="div" sx={{ mb: 2 }}>
        <strong>Example cURL:</strong>
        <Box
          component="pre"
          sx={{
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            padding: 1,
            borderRadius: 1,
            mt: 1,
            overflowX: 'auto'
          }}
        >
          {`curl -X POST ${API_HOST}/create-session/${run.podcast_id}`}
        </Box>
      </Typography>

      <Typography variant="body2" component="div" sx={{ mb: 2 }}>
        <strong>Example Response:</strong>
        <Box
          component="pre"
          sx={{
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            padding: 1,
            borderRadius: 1,
            mt: 1,
            overflowX: 'auto'
          }}
        >
          {`{
        "session_id": "a1b2c3d4-e5f6-7890-1234-abcdef567890"
      }`}
        </Box>
      </Typography>

      <Typography variant="body2" sx={{ mb: 1 }}>
        Use this <code>session_id</code> in subsequent requests to <code>/inference-llm</code> or <code>/inference-llm/stream</code> by including it in the JSON payload:
      </Typography>

      <Box
        component="pre"
        sx={{
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          padding: 1,
          borderRadius: 1,
          mt: 1,
          overflowX: 'auto'
        }}
      >
      {`{
        "input": "What did I ask earlier?",
        "temperature": 0.5,
        "max_tokens": 500,
        "session_id": "a1b2c3d4-e5f6-7890-1234-abcdef567890"
      }`}
      </Box>

      </Box>
      
    );
  } else {
    // For vision-language models (VLM), retain the original documentation.
    const bEndpoint = `https://console.vais.app/api/{method}/{model_id}`;
    const baseUrl = `https://console.vais.app/api/inference/${run.podcast_id}`;
    const baseUrlB64 = `https://console.vais.app/api/inference_b64/${run.podcast_id}`;
    return (
      <Box>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <InfoTwoToneIcon color="primary" />
          <Typography variant="h6">
            Interactive API Documentation — VLM Endpoints
          </Typography>
        </Box>

        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
          Base Endpoint:
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          <code>{bEndpoint}</code>
        </Typography>

        <Typography variant="body2" sx={{ mb: 2 }}>
          <strong>Optional Parameters (for both endpoints)</strong>
          <ul>
            <li>
              <strong>temperature</strong> (float) — default{' '}
              <code>0.5</code>
            </li>
            <li>
              <strong>max_tokens</strong> (integer) — default{' '}
              <code>500</code>
            </li>
          </ul>
          These parameters control the model's response randomness and length.
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* /inference */}
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          1. POST /inference/
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>Description:</strong> Sends a multipart/form-data request
          with an <code>input</code> (text prompt) and an{' '}
          <code>image</code> (file). Optional fields <code>temperature</code> and{' '}
          <code>max_tokens</code> can also be provided.
        </Typography>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>Example cURL:</strong>
          <Box
            component="pre"
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              padding: 1,
              borderRadius: 1,
              mt: 1,
              overflowX: 'auto'
            }}
          >
            {`curl -X POST \\
  -F "input=Describe the attached image" \\
  -F "image=@path/to/local_image.jpg" \\
  -F "temperature=0.5" \\
  -F "max_tokens=500" \\
  ${baseUrl}`}
          </Box>
        </Typography>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>Example Postman:</strong>
          <Box
            component="pre"
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              padding: 1,
              borderRadius: 1,
              mt: 1,
              overflowX: 'auto'
            }}
          >
            {`POST ${baseUrl}
Headers:
  Content-Type: multipart/form-data

Body (form-data):
  input: "Describe the attached image"
  image: (file) path/to/local_image.jpg
  temperature (optional): 0.5
  max_tokens (optional): 500
`}
          </Box>
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* /inference_b64 */}
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          2. POST /inference_b64/
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>Description:</strong> Sends a JSON request with an{' '}
          <code>input</code> (text prompt) and an <code>image</code> in base64
          format. Optional fields <code>temperature</code> and{' '}
          <code>max_tokens</code> are also available.
        </Typography>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>Example cURL:</strong>
          <Box
            component="pre"
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              padding: 1,
              borderRadius: 1,
              mt: 1,
              overflowX: 'auto'
            }}
          >
            {`curl -X POST -H "Content-Type: application/json" \\
  -d '{
    "input": "Describe this base64-encoded image",
    "image": "<BASE64_ENCODED_IMAGE>",
    "temperature": 0.5,
    "max_tokens": 500
  }' \\
  ${baseUrlB64}`}
          </Box>
        </Typography>

        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          <strong>Example Postman:</strong>
          <Box
            component="pre"
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              padding: 1,
              borderRadius: 1,
              mt: 1,
              overflowX: 'auto'
            }}
          >
            {`POST ${baseUrlB64}
Headers:
  Content-Type: application/json

Body (raw JSON):
{
  "input": "Describe this base64-encoded image",
  "image": "<BASE64_ENCODED_IMAGE>",
  "temperature": 0.5,
  "max_tokens": 500
}
`}
          </Box>
        </Typography>
      </Box>
    );
  }
};

  return (
    <Card>
      {selectedRuns.length > 0 && (
        <Box flex={1} p={2}>
          <BulkActions />
        </Box>
      )}
      {selectedRuns.length === 0 && (
        <CardHeader
          action={
            <Box width={150}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status || 'all'}
                  onChange={handleStatusChange}
                  label="Status"
                  autoWidth
                >
                  {statusOptions.map((statusOption) => (
                    <MenuItem key={statusOption.id} value={statusOption.id}>
                      {statusOption.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          }
          title="Recent Models"
        />
      )}
      <Divider />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Model Name</TableCell>
              <TableCell>Model Type</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Model ID</TableCell>
              <TableCell>Created At</TableCell>
              {/* <TableCell>Updated At</TableCell> */}
              <TableCell>Train More</TableCell>
              <TableCell>Use Model</TableCell>
              <TableCell>Delete</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedRuns.map((run) => {
              const isSelected = selectedRuns.includes(run.run_id);
              return (
                <TableRow hover key={run.run_id} selected={isSelected}>
                  <TableCell>
                    <Typography variant="body1" fontWeight="bold" noWrap>
                      {run.model_name}
                    </Typography>
                  </TableCell>
                  <TableCell>{run.model_type}</TableCell>
                  <TableCell>{run.description}</TableCell>
                  <TableCell>{getStatusLabel(run.status)}</TableCell>
                  <TableCell>{run.podcast_id}</TableCell>
                  {/* <TableCell>
                    {run.created_at
                      ? format(new Date(run.created_at), 'MMM dd, HH:mm')
                      : ''}
                  </TableCell> */}
                  <TableCell>
                    {run.updated_at
                      ? format(new Date(run.updated_at), 'MMM dd, HH:mm')
                      : ''}
                  </TableCell>
                  <TableCell>
                    {run.status === 'finished' ? (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleTrainMore(run)}
                        disabled
                      >
                        Retrain
                      </Button>
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {run.status === 'finished' && (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => setSelectedRunForApi(run)}
                      >
                        API
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleDeleteClick(run)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Box p={2}>
        <TablePagination
          component="div"
          count={filteredRuns.length}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleLimitChange}
          page={page}
          rowsPerPage={limit}
          rowsPerPageOptions={[5, 10, 25, 30]}
        />
      </Box>

      {/* Dialog for API Documentation */}
      <Dialog
        open={Boolean(selectedRunForApi)}
        onClose={() => setSelectedRunForApi(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedRunForApi ? (
            <>
              Run API Details —{' '}
              <strong>{selectedRunForApi.model_name}</strong>
            </>
          ) : (
            'Run API Details'
          )}
        </DialogTitle>
        <DialogContent>
          {selectedRunForApi ? (
            renderApiDocumentation(selectedRunForApi)
          ) : (
            <Typography>No run selected</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedRunForApi(null)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete{' '}
            <strong>{runToDelete?.model_name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

RecentOrdersTable.propTypes = {
  // No external props needed since data is fetched within the component
};

RecentOrdersTable.defaultProps = {};

export default RecentOrdersTable;
