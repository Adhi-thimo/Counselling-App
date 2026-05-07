import React, { useState } from 'react';
import {
  Container,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Paper,
  Grid,
  Alert,
  Card,
  CardContent,
  Avatar,
  createTheme,
  ThemeProvider,
} from '@mui/material';
import {
  Person,
  Phone,
  Home,
  Event,
  Schedule,
  Psychology,
  AssignmentInd,
  Send,
} from '@mui/icons-material';
import axios from 'axios';

// Custom theme with calming colors
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // Blue
    },
    secondary: {
      main: '#4caf50', // Green
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
});

function App() {
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    address: '',
    date: '',
    time: '',
    type: '',
    processedBy: '',
  });
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('https://script.google.com/macros/s/AKfycbybBqAo_pyln7fAeM9Fisv8lqlz6so3q0YnBmtI_Ci0Ex5AToqBszG3-HqDONEYGWpw/exec', formData);
      setMessage('Booking successful! Reminder will be sent.');
      // ... notification code ...

      // Request notification permission and show notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Booking Confirmed', {
          body: `Your counselling session is booked for ${formData.date} at ${formData.time}.`,
          icon: '/vite.svg',
        });
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification('Booking Confirmed', {
              body: `Your counselling session is booked for ${formData.date} at ${formData.time}.`,
              icon: '/vite.svg',
            });
          }
        });
      }
    } catch (error) {
      setMessage('Error booking session. Please try again.');
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          p: { xs: 1, sm: 2 },
          pt: { xs: 2, sm: 4 },
          pb: { xs: 2, sm: 4 },
          overflowY: 'auto',
        }}
      >
        <Container maxWidth="xs">
          <Card
            elevation={10}
            sx={{
              borderRadius: 3,
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
              <Box textAlign="center" mb={2}>
                <Avatar
                  sx={{
                    width: { xs: 50, sm: 70 },
                    height: { xs: 50, sm: 70 },
                    bgcolor: 'primary.main',
                    mx: 'auto',
                    mb: 1.5,
                  }}
                >
                  <Psychology sx={{ fontSize: { xs: 26, sm: 36 } }} />
                </Avatar>
                <Typography
                  variant="h5"
                  component="h1"
                  gutterBottom
                  color="primary"
                  sx={{ fontSize: { xs: '1.5rem', sm: '1.875rem' }, fontWeight: 'bold' }}
                >
                  Rol's Counselling
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.8rem', sm: '0.95rem' } }}
                >
                  Book your counselling session
                </Typography>
              </Box>
              <Box component="form" onSubmit={handleSubmit}>
                <Grid container spacing={1.5}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Person sx={{ color: 'action.active' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Contact Number"
                      name="contact"
                      value={formData.contact}
                      onChange={handleChange}
                      required
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Phone sx={{ color: 'action.active' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      required
                      multiline
                      rows={2}
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Home sx={{ color: 'action.active' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Date"
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleChange}
                      InputLabelProps={{ shrink: true }}
                      required
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Event sx={{ color: 'action.active' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Time"
                      name="time"
                      type="time"
                      value={formData.time}
                      onChange={handleChange}
                      InputLabelProps={{ shrink: true }}
                      required
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Schedule sx={{ color: 'action.active' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <FormControl fullWidth required size="small" variant="outlined">
                      <InputLabel id="type-of-counselling-label">Type of Counselling</InputLabel>
                      <Select
                        labelId="type-of-counselling-label"
                        id="type-of-counselling"
                        label="Type of Counselling"
                        fullWidth
                        name="type"
                        value={formData.type}
                        onChange={handleChange}
                        sx={{
                          borderRadius: 2,
                        }}
                        displayEmpty
                      >
                        <MenuItem value="" disabled>
                          Select counselling type
                        </MenuItem>
                        <MenuItem value="pre-marital">Pre-Marital</MenuItem>
                        <MenuItem value="family">Family</MenuItem>
                        <MenuItem value="mental-health">Mental Health</MenuItem>
                        <MenuItem value="career">Career Counselling</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Processed By"
                      name="processedBy"
                      value={formData.processedBy}
                      onChange={handleChange}
                      required
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <AssignmentInd sx={{ color: 'action.active' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2.5, textAlign: 'center' }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    size="medium"
                    startIcon={<Send />}
                    fullWidth
                    sx={{
                      py: { xs: 1, sm: 1.2 },
                      borderRadius: 3,
                      fontWeight: 'bold',
                      boxShadow: 3,
                      textTransform: 'uppercase',
                      fontSize: { xs: '0.8rem', sm: '0.9rem' },
                      '&:hover': {
                        boxShadow: 6,
                        transform: 'translateY(-2px)',
                        transition: 'all 0.3s ease',
                      },
                    }}
                  >
                    Book Session
                  </Button>
                </Box>
              </Box>
              {message && (
                <Alert
                  severity={message.includes('successful') ? 'success' : 'error'}
                  sx={{ mt: 2, borderRadius: 2, fontSize: '0.9rem' }}
                >
                  {message}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
