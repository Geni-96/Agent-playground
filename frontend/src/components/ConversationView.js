import React from 'react';
import {
  Paper,
  Typography,
  Box,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Person as PersonIcon,
  SmartToy as BotIcon,
  VolumeUp as VolumeUpIcon,
  Mic as MicIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { formatDistanceToNow, format } from 'date-fns';

const getMessageTypeColor = (type) => {
  switch (type) {
    case 'voice_received': return '#2196f3';
    case 'voice_response': return '#4caf50';
    case 'sent': return '#4caf50';
    case 'received': return '#2196f3';
    case 'system': return '#ff9800';
    default: return '#757575';
  }
};

const getMessageTypeIcon = (type) => {
  switch (type) {
    case 'voice_received': return <MicIcon />;
    case 'voice_response': return <VolumeUpIcon />;
    case 'sent': return <BotIcon />;
    case 'received': return <PersonIcon />;
    case 'system': return <PsychologyIcon />;
    default: return <PersonIcon />;
  }
};

const MessageBubble = ({ message, isFromAgent }) => {
  const timestamp = message.timestamp 
    ? format(new Date(message.timestamp), 'HH:mm:ss')
    : '';
  
  const timeAgo = message.timestamp
    ? formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })
    : '';

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isFromAgent ? 'flex-end' : 'flex-start',
        mb: 2,
      }}
    >
      <Box
        sx={{
          maxWidth: '70%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          flexDirection: isFromAgent ? 'row-reverse' : 'row',
        }}
      >
        <Avatar
          sx={{
            bgcolor: getMessageTypeColor(message.type),
            width: 32,
            height: 32,
          }}
        >
          {getMessageTypeIcon(message.type)}
        </Avatar>

        <Paper
          elevation={1}
          sx={{
            p: 2,
            bgcolor: isFromAgent ? 'primary.light' : 'grey.100',
            color: isFromAgent ? 'primary.contrastText' : 'text.primary',
            borderRadius: isFromAgent ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          }}
        >
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Typography variant="caption" fontWeight="bold">
              {message.from}
            </Typography>
            <Chip
              label={message.type}
              size="small"
              variant="outlined"
              sx={{ 
                height: 16, 
                fontSize: '0.6rem',
                opacity: 0.7,
              }}
            />
            {message.confidence && (
              <Chip
                label={`${Math.round(message.confidence * 100)}%`}
                size="small"
                color={message.confidence > 0.8 ? 'success' : 'warning'}
                variant="outlined"
                sx={{ 
                  height: 16, 
                  fontSize: '0.6rem',
                }}
              />
            )}
          </Box>

          <Typography variant="body1" sx={{ mb: 1 }}>
            {message.content}
          </Typography>

          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {timestamp}
            </Typography>
            {message.responseTime && (
              <Tooltip title={`Response time: ${message.responseTime}ms`}>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  {message.responseTime}ms
                </Typography>
              </Tooltip>
            )}
          </Box>

          {message.llmProvider && message.llmModel && (
            <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', mt: 0.5 }}>
              {message.llmProvider}/{message.llmModel}
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

const ConversationView = ({ 
  messages = [], 
  transcription = null, 
  className = '',
  showTranscription = true 
}) => {
  const messagesEndRef = React.useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <Paper 
      className={className}
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6">
          Conversation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {messages.length} messages
        </Typography>
      </Box>

      {showTranscription && transcription && (
        <Box
          sx={{
            p: 2,
            bgcolor: 'info.light',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="info.dark" fontWeight="bold">
            Live Transcription ({Math.round((transcription.confidence || 0) * 100)}%)
          </Typography>
          <Typography variant="body2" color="info.dark">
            {transcription.text}
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          bgcolor: 'grey.50',
        }}
      >
        {messages.length === 0 ? (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height="100%"
            flexDirection="column"
            color="text.secondary"
          >
            <BotIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
            <Typography variant="h6" align="center">
              No conversation yet
            </Typography>
            <Typography variant="body2" align="center">
              Start a conversation by creating agents and making them speak
            </Typography>
          </Box>
        ) : (
          <>
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id || index}
                message={message}
                isFromAgent={message.from !== 'human' && message.from !== 'system'}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </Box>
    </Paper>
  );
};

export default ConversationView;
