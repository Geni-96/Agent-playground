import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Slider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Chip,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

const personaTemplates = {
  helpful: "You are a helpful and friendly AI assistant. You always try to be supportive and provide useful information.",
  creative: "You are a creative and imaginative AI. You love to think outside the box and come up with innovative ideas.",
  analytical: "You are a logical and analytical AI. You approach problems systematically and value data-driven decisions.",
  humorous: "You are a witty and humorous AI. You like to add light-hearted jokes and keep conversations entertaining.",
  philosophical: "You are a thoughtful and philosophical AI. You enjoy deep discussions about life, ethics, and meaning.",
  debate: "You are a skilled debater who enjoys intellectual discourse. You present well-reasoned arguments and challenge ideas constructively.",
  storyteller: "You are a creative storyteller who loves to weave engaging narratives and bring characters to life.",
  educator: "You are a patient and knowledgeable educator who enjoys teaching and helping others learn new concepts.",
  scientist: "You are a curious scientist who approaches problems with empirical thinking and evidence-based reasoning.",
  artist: "You are a creative artist with a deep appreciation for beauty, aesthetics, and artistic expression.",
};

const AgentCreator = ({ 
  open, 
  onClose, 
  onSubmit, 
  agent = null, 
  loading = false 
}) => {
  const [formData, setFormData] = React.useState({
    persona: '',
    name: '',
    roomId: '',
    llm: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000,
    },
    tts: {
      provider: 'elevenlabs',
      voiceId: '',
      speed: 1.0,
      pitch: 1.0,
    },
  });

  const isEditing = Boolean(agent);

  React.useEffect(() => {
    if (agent) {
      setFormData({
        persona: agent.persona || '',
        name: agent.agentId || '',
        roomId: agent.roomId || '',
        llm: {
          provider: agent.config?.llm?.provider || 'openai',
          model: agent.config?.llm?.model || 'gpt-4',
          temperature: agent.config?.llm?.temperature || 0.7,
          maxTokens: agent.config?.llm?.maxTokens || 1000,
        },
        tts: {
          provider: agent.config?.tts?.provider || 'elevenlabs',
          voiceId: agent.config?.tts?.voiceId || '',
          speed: agent.config?.tts?.speed || 1.0,
          pitch: agent.config?.tts?.pitch || 1.0,
        },
      });
    } else {
      // Reset form for new agent
      setFormData({
        persona: '',
        name: '',
        roomId: '',
        llm: {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000,
        },
        tts: {
          provider: 'elevenlabs',
          voiceId: '',
          speed: 1.0,
          pitch: 1.0,
        },
      });
    }
  }, [agent, open]);

  const handleChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const handlePersonaTemplate = (template) => {
    setFormData(prev => ({
      ...prev,
      persona: personaTemplates[template],
    }));
  };

  const handleSubmit = () => {
    const submitData = {
      persona: formData.persona,
      ...(formData.name && { agentId: formData.name }),
      ...(formData.roomId && { roomId: formData.roomId }),
      config: {
        llm: formData.llm,
        tts: formData.tts,
      },
    };

    onSubmit(submitData);
  };

  const isValid = formData.persona.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '70vh' }
      }}
    >
      <DialogTitle>
        {isEditing ? 'Edit Agent' : 'Create New Agent'}
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Quick Persona Templates
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {Object.keys(personaTemplates).map((template) => (
              <Chip
                key={template}
                label={template}
                onClick={() => handlePersonaTemplate(template)}
                variant="outlined"
                size="small"
                sx={{ 
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'primary.light' }
                }}
              />
            ))}
          </Box>
        </Box>

        <TextField
          fullWidth
          label="Agent Name (optional)"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          sx={{ mb: 2 }}
          placeholder="Leave empty for auto-generated ID"
          disabled={isEditing}
        />

        <TextField
          fullWidth
          label="Room ID (optional)"
          value={formData.roomId}
          onChange={(e) => handleChange('roomId', e.target.value)}
          sx={{ mb: 2 }}
          placeholder="Room for agent to join"
        />

        <TextField
          fullWidth
          label="Agent Persona"
          value={formData.persona}
          onChange={(e) => handleChange('persona', e.target.value)}
          multiline
          rows={4}
          sx={{ mb: 3 }}
          placeholder="Describe the agent's personality and behavior..."
          required
        />

        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">LLM Configuration</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Provider</InputLabel>
                  <Select
                    value={formData.llm.provider}
                    label="Provider"
                    onChange={(e) => handleChange('llm.provider', e.target.value)}
                  >
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="anthropic">Anthropic</MenuItem>
                    <MenuItem value="local">Local</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Model</InputLabel>
                  <Select
                    value={formData.llm.model}
                    label="Model"
                    onChange={(e) => handleChange('llm.model', e.target.value)}
                  >
                    {formData.llm.provider === 'openai' && [
                      <MenuItem key="gpt-4" value="gpt-4">GPT-4</MenuItem>,
                      <MenuItem key="gpt-3.5-turbo" value="gpt-3.5-turbo">GPT-3.5 Turbo</MenuItem>,
                    ]}
                    {formData.llm.provider === 'anthropic' && [
                      <MenuItem key="claude-3" value="claude-3-sonnet-20240229">Claude 3 Sonnet</MenuItem>,
                      <MenuItem key="claude-3-haiku" value="claude-3-haiku-20240307">Claude 3 Haiku</MenuItem>,
                    ]}
                    {formData.llm.provider === 'local' && [
                      <MenuItem key="local-model" value="local-model">Local Model</MenuItem>,
                    ]}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography gutterBottom>
                  Temperature: {formData.llm.temperature}
                </Typography>
                <Slider
                  value={formData.llm.temperature}
                  onChange={(e, value) => handleChange('llm.temperature', value)}
                  min={0}
                  max={2}
                  step={0.1}
                  marks={[
                    { value: 0, label: 'Focused' },
                    { value: 1, label: 'Balanced' },
                    { value: 2, label: 'Creative' },
                  ]}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Max Tokens"
                  type="number"
                  value={formData.llm.maxTokens}
                  onChange={(e) => handleChange('llm.maxTokens', parseInt(e.target.value))}
                  inputProps={{ min: 1, max: 4000 }}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">Text-to-Speech Configuration</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>TTS Provider</InputLabel>
                  <Select
                    value={formData.tts.provider}
                    label="TTS Provider"
                    onChange={(e) => handleChange('tts.provider', e.target.value)}
                  >
                    <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="azure">Azure</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Voice ID"
                  value={formData.tts.voiceId}
                  onChange={(e) => handleChange('tts.voiceId', e.target.value)}
                  placeholder="Voice identifier from provider"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography gutterBottom>
                  Speed: {formData.tts.speed}
                </Typography>
                <Slider
                  value={formData.tts.speed}
                  onChange={(e, value) => handleChange('tts.speed', value)}
                  min={0.5}
                  max={2}
                  step={0.1}
                  marks={[
                    { value: 0.5, label: 'Slow' },
                    { value: 1, label: 'Normal' },
                    { value: 2, label: 'Fast' },
                  ]}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography gutterBottom>
                  Pitch: {formData.tts.pitch}
                </Typography>
                <Slider
                  value={formData.tts.pitch}
                  onChange={(e, value) => handleChange('tts.pitch', value)}
                  min={0.5}
                  max={2}
                  step={0.1}
                  marks={[
                    { value: 0.5, label: 'Low' },
                    { value: 1, label: 'Normal' },
                    { value: 2, label: 'High' },
                  ]}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid || loading}
        >
          {loading ? 'Creating...' : (isEditing ? 'Update Agent' : 'Create Agent')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AgentCreator;
