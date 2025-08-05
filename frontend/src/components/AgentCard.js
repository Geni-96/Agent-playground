import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  IconButton,
  Menu,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  VolumeUp as VolumeUpIcon,
  Psychology as PsychologyIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

const getStatusColor = (status) => {
  switch (status) {
    case 'speaking': return 'error';
    case 'listening': return 'info';
    case 'processing': return 'warning';
    case 'thinking': return 'secondary';
    case 'idle': return 'success';
    default: return 'default';
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'speaking': return <VolumeUpIcon />;
    case 'listening': return <MicIcon />;
    case 'processing': return <PsychologyIcon />;
    case 'thinking': return <PsychologyIcon />;
    case 'idle': return <MicOffIcon />;
    default: return <MicOffIcon />;
  }
};

const AgentCard = ({ 
  agent, 
  onEdit, 
  onDelete, 
  onSpeak,
  onJoinRoom,
  voiceStats = {},
  className = ''
}) => {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    handleMenuClose();
    onEdit?.(agent);
  };

  const handleDelete = () => {
    handleMenuClose();
    onDelete?.(agent.agentId);
  };

  const handleSpeak = () => {
    handleMenuClose();
    onSpeak?.(agent.agentId);
  };

  const handleJoinRoom = () => {
    handleMenuClose();
    onJoinRoom?.(agent.agentId);
  };

  const isProcessing = ['processing', 'thinking'].includes(agent.status);
  const lastActivityTime = agent.lastActivity 
    ? formatDistanceToNow(new Date(agent.lastActivity), { addSuffix: true })
    : 'Never';

  return (
    <Card 
      className={className}
      sx={{ 
        height: '100%',
        position: 'relative',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        },
        ...(agent.status === 'speaking' && {
          borderLeft: '4px solid #f44336',
        }),
        ...(agent.status === 'listening' && {
          borderLeft: '4px solid #2196f3',
        }),
      }}
    >
      {isProcessing && (
        <LinearProgress 
          color={getStatusColor(agent.status)}
          sx={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0,
            height: 2 
          }} 
        />
      )}
      
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box flex={1}>
            <Typography variant="h6" component="div" noWrap>
              {agent.agentId}
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mt={1}>
              <Chip 
                icon={getStatusIcon(agent.status)}
                label={agent.status}
                color={getStatusColor(agent.status)}
                size="small"
                variant="outlined"
              />
              {agent.roomId && (
                <Chip 
                  label={`Room: ${agent.roomId}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
          
          <IconButton
            size="small"
            onClick={handleMenuClick}
            aria-label="Agent options"
          >
            <MoreVertIcon />
          </IconButton>
        </Box>

        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ 
            mb: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {agent.persona}
        </Typography>

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="caption" color="text.secondary">
            Messages: {agent.metadata?.totalMessages || 0}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            LLM: {agent.metadata?.llmCalls || 0}
          </Typography>
        </Box>

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="caption" color="text.secondary">
            Voice: {agent.metadata?.voiceInteractions || 0}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            TTS: {agent.metadata?.ttsCalls || 0}
          </Typography>
        </Box>

        {voiceStats.speakingQueueLength > 0 && (
          <Box mb={1}>
            <Typography variant="caption" color="text.secondary">
              Speaking Queue: {voiceStats.speakingQueueLength}
            </Typography>
          </Box>
        )}

        <Typography variant="caption" color="text.secondary">
          Last Activity: {lastActivityTime}
        </Typography>

        {agent.config && (
          <Box mt={2}>
            <Typography variant="caption" color="text.secondary" display="block">
              LLM: {agent.config.llm?.provider}/{agent.config.llm?.model}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              TTS: {agent.config.tts?.provider}
              {agent.config.tts?.voiceId && ` (${agent.config.tts.voiceId})`}
            </Typography>
          </Box>
        )}
      </CardContent>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleMenuClose}
        MenuListProps={{
          'aria-labelledby': 'agent-options-button',
        }}
      >
        <MenuItem onClick={handleEdit}>
          <SettingsIcon sx={{ mr: 1 }} />
          Configure
        </MenuItem>
        <MenuItem onClick={handleSpeak}>
          <VolumeUpIcon sx={{ mr: 1 }} />
          Make Speak
        </MenuItem>
        <MenuItem onClick={handleJoinRoom}>
          <MicIcon sx={{ mr: 1 }} />
          Join Room
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </Card>
  );
};

export default AgentCard;
