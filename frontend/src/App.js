import React from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Grid,
  Paper,
  Fab,
  Chip,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  SignalWifiOff as DisconnectedIcon,
  Wifi as ConnectedIcon,
} from '@mui/icons-material';

import AgentCard from './components/AgentCard';
import AgentCreator from './components/AgentCreator';
import ConversationView from './components/ConversationView';
import { useAgents } from './hooks/useAgents';
import { useConversation, useVoiceInteraction } from './hooks/useConversation';
import { useWebSocket } from './hooks/useWebSocket';
import { agentAPI } from './services/api';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    h4: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 500,
    },
  },
});

function App() {
  const [creatorOpen, setCreatorOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState(null);
  const [selectedRoom, setSelectedRoom] = React.useState('general');
  const [snackbar, setSnackbar] = React.useState({ open: false, message: '', severity: 'info' });
  const [loading, setLoading] = React.useState(false);

  // Hooks
  const { agents, createAgent, updateAgent, deleteAgent, fetchAgents } = useAgents();
  const { messages, transcription } = useConversation(selectedRoom);
  const { speakingAgents, voiceStats } = useVoiceInteraction();
  const { connectionState, isConnected } = useWebSocket();

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleCreateAgent = async (agentData) => {
    try {
      setLoading(true);
      await createAgent(agentData);
      setCreatorOpen(false);
      showSnackbar('Agent created successfully!', 'success');
    } catch (error) {
      console.error('Failed to create agent:', error);
      showSnackbar('Failed to create agent: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditAgent = (agent) => {
    setEditingAgent(agent);
    setCreatorOpen(true);
  };

  const handleUpdateAgent = async (agentData) => {
    try {
      setLoading(true);
      await updateAgent(editingAgent.agentId, agentData);
      setCreatorOpen(false);
      setEditingAgent(null);
      showSnackbar('Agent updated successfully!', 'success');
    } catch (error) {
      console.error('Failed to update agent:', error);
      showSnackbar('Failed to update agent: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId) => {
    if (window.confirm('Are you sure you want to delete this agent?')) {
      try {
        await deleteAgent(agentId);
        showSnackbar('Agent deleted successfully!', 'success');
      } catch (error) {
        console.error('Failed to delete agent:', error);
        showSnackbar('Failed to delete agent: ' + error.message, 'error');
      }
    }
  };

  const handleSpeak = async (agentId) => {
    const text = prompt('What should the agent say?');
    if (text) {
      try {
        await agentAPI.speakAgent(agentId, text);
        showSnackbar('Agent is speaking...', 'info');
      } catch (error) {
        console.error('Failed to make agent speak:', error);
        showSnackbar('Failed to make agent speak: ' + error.message, 'error');
      }
    }
  };

  const handleJoinRoom = async (agentId) => {
    const roomId = prompt('Which room should the agent join?', selectedRoom);
    if (roomId) {
      try {
        await agentAPI.joinRoom(agentId, roomId);
        setSelectedRoom(roomId);
        showSnackbar(`Agent joined room: ${roomId}`, 'success');
      } catch (error) {
        console.error('Failed to join room:', error);
        showSnackbar('Failed to join room: ' + error.message, 'error');
      }
    }
  };

  const handleCreatorClose = () => {
    setCreatorOpen(false);
    setEditingAgent(null);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static" elevation={1}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              🤖 Stream-Aware Agent Playground
            </Typography>
            
            <Box display="flex" alignItems="center" gap={2}>
              <Chip
                icon={isConnected ? <ConnectedIcon /> : <DisconnectedIcon />}
                label={connectionState}
                color={isConnected ? 'success' : 'error'}
                variant="outlined"
                size="small"
                sx={{ color: 'white', borderColor: 'white' }}
              />
              
              <IconButton color="inherit" onClick={fetchAgents} title="Refresh">
                <RefreshIcon />
              </IconButton>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ mt: 3, mb: 3 }}>
          <Grid container spacing={3}>
            {/* Agents Section */}
            <Grid item xs={12} lg={8}>
              <Paper sx={{ p: 3, mb: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                  <Typography variant="h5">
                    Active Agents ({agents.length})
                  </Typography>
                  <Box display="flex" gap={1}>
                    {speakingAgents.size > 0 && (
                      <Chip
                        label={`${speakingAgents.size} speaking`}
                        color="error"
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                </Box>

                {agents.length === 0 ? (
                  <Box
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="center"
                    py={8}
                    color="text.secondary"
                  >
                    <Typography variant="h6" mb={2}>
                      No agents created yet
                    </Typography>
                    <Typography variant="body2" mb={3}>
                      Create your first AI agent to get started
                    </Typography>
                  </Box>
                ) : (
                  <Grid container spacing={2}>
                    {agents.map((agent) => (
                      <Grid item xs={12} sm={6} md={4} key={agent.agentId}>
                        <AgentCard
                          agent={agent}
                          onEdit={handleEditAgent}
                          onDelete={handleDeleteAgent}
                          onSpeak={handleSpeak}
                          onJoinRoom={handleJoinRoom}
                          voiceStats={voiceStats[agent.agentId] || {}}
                        />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Paper>
            </Grid>

            {/* Conversation Section */}
            <Grid item xs={12} lg={4}>
              <ConversationView
                messages={messages}
                transcription={transcription}
                sx={{ height: '70vh' }}
              />
            </Grid>
          </Grid>
        </Container>

        {/* Floating Action Button */}
        <Fab
          color="primary"
          aria-label="add agent"
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
          }}
          onClick={() => setCreatorOpen(true)}
        >
          <AddIcon />
        </Fab>

        {/* Agent Creator Dialog */}
        <AgentCreator
          open={creatorOpen}
          onClose={handleCreatorClose}
          onSubmit={editingAgent ? handleUpdateAgent : handleCreateAgent}
          agent={editingAgent}
          loading={loading}
        />

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Alert 
            onClose={handleCloseSnackbar} 
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App;
