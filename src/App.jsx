import React, { useEffect, useState } from 'react';
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
  Grid,
  Alert,
  Card,
  CardContent,
  Avatar,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  createTheme,
  ThemeProvider,
} from '@mui/material';
import { DatePicker, TimePicker } from '@mui/x-date-pickers';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import {
  Person,
  Phone,
  Home,
  Psychology,
  AssignmentInd,
  EventNote,
  Refresh,
  Send,
} from '@mui/icons-material';
import axios from 'axios';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const bookingApiUrl = `${apiBaseUrl}/api/book`;
const bookingsApiUrl = `${apiBaseUrl}/api/bookings`;

// Custom theme with calming colors
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#4caf50',
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
  components: {
    MuiMultiSectionDigitalClockSection: {
      styleOverrides: {
        root: {
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': {
            width: 0,
            height: 0,
          },
        },
      },
    },
  },
});

function App() {
  const [activeView, setActiveView] = useState('form');
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
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState('');

  const loadBookings = async () => {
    setBookingsLoading(true);
    setBookingsError('');

    try {
      const response = await axios.get(bookingsApiUrl);
      setBookings(response.data?.bookings || []);
    } catch (error) {
      const errData = error.response?.data?.error;
      const errMsg = typeof errData === 'object' && errData !== null
        ? (errData.message || JSON.stringify(errData))
        : (errData || error.message || 'Failed to load bookings.');
      setBookingsError(errMsg);
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'bookings') {
      loadBookings();
    }
  }, [activeView]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDateChange = (value) => {
    setFormData({ ...formData, date: value ? dayjs(value).format('YYYY-MM-DD') : '' });
  };

  const handleTimeChange = (value) => {
    setFormData({ ...formData, time: value ? dayjs(value).format('HH:mm') : '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(bookingApiUrl, formData);
      setMessage(response.data?.message || 'Booking successful! Reminder will be sent.');
      setFormData({
        name: '',
        contact: '',
        address: '',
        date: '',
        time: '',
        type: '',
        processedBy: '',
      });
      setActiveView('bookings');
      await loadBookings();

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Booking Confirmed', {
          body: `Your counselling session is booked for ${formData.date} at ${formData.time}.`,
        });
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification('Booking Confirmed', {
              body: `Your counselling session is booked for ${formData.date} at ${formData.time}.`,
            });
          }
        });
      }
    } catch (error) {
      const errData = error.response?.data?.error;
      const errMsg = typeof errData === 'object' && errData !== null
        ? (errData.message || JSON.stringify(errData))
        : (errData || error.message || 'Error booking session. Please try again.');
      setMessage(errMsg);
    }
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      color: '#1f2937',
      backgroundColor: '#ffffff',
      '& input': {
        color: '#1f2937',
      },
      '& textarea': {
        color: '#1f2937',
      },
      '& .MuiSelect-select': {
        color: '#1f2937',
      },
      '& input:-webkit-autofill': {
        WebkitBoxShadow: '0 0 0 100px #ffffff inset',
        WebkitTextFillColor: '#1f2937',
        caretColor: '#1f2937',
        borderRadius: 'inherit',
        transition: 'background-color 9999s ease-out 0s',
      },
      '& input:-webkit-autofill:hover': {
        WebkitBoxShadow: '0 0 0 100px #ffffff inset',
      },
      '& input:-webkit-autofill:focus': {
        WebkitBoxShadow: '0 0 0 100px #ffffff inset',
      },
      '& textarea:-webkit-autofill': {
        WebkitBoxShadow: '0 0 0 100px #ffffff inset',
        WebkitTextFillColor: '#1f2937',
      },
    },
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
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
              <Box sx={{ textAlign: 'center', mb: 2 }}>
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
                  {activeView === 'form' ? 'Book your counselling session' : 'View recent bookings'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ mb: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button
                  variant={activeView === 'form' ? 'contained' : 'outlined'}
                  onClick={() => setActiveView('form')}
                >
                  New Booking
                </Button>
                <Button
                  variant={activeView === 'bookings' ? 'contained' : 'outlined'}
                  startIcon={<EventNote />}
                  onClick={() => setActiveView('bookings')}
                >
                  View Bookings
                </Button>
              </Stack>
              {activeView === 'form' ? (
              <Box component="form" onSubmit={handleSubmit}>
                <Grid container spacing={1.5}>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      size="small"
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <Person sx={{ color: 'action.active' }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                      sx={inputSx}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Contact Number"
                      name="contact"
                      value={formData.contact}
                      onChange={handleChange}
                      required
                      size="small"
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <Phone sx={{ color: 'action.active' }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                      sx={inputSx}
                    />
                  </Grid>
                  <Grid size={12}>
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
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <Home sx={{ color: 'action.active' }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                      sx={inputSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <DatePicker
                      label="Date"
                      value={formData.date ? dayjs(formData.date) : null}
                      onChange={handleDateChange}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          size: 'small',
                          sx: inputSx,
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TimePicker
                      label="Time"
                      value={formData.time ? dayjs(`2000-01-01T${formData.time}`) : null}
                      onChange={handleTimeChange}
                      minutesStep={5}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          size: 'small',
                          sx: inputSx,
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <FormControl fullWidth required size="small" variant="outlined">
                      <InputLabel id="type-of-counselling-label">Type of Counselling</InputLabel>
                      <Select
                        labelId="type-of-counselling-label"
                        id="type-of-counselling"
                        label="Type of Counselling"
                        name="type"
                        value={formData.type}
                        onChange={handleChange}
                        sx={{ borderRadius: 2 }}
                      >
                        <MenuItem value="pre-marital">Pre-Marital</MenuItem>
                        <MenuItem value="family">Family</MenuItem>
                        <MenuItem value="mental-health">Mental Health</MenuItem>
                        <MenuItem value="career">Career Counselling</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Processed By"
                      name="processedBy"
                      value={formData.processedBy}
                      onChange={handleChange}
                      required
                      size="small"
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <AssignmentInd sx={{ color: 'action.active' }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                      sx={inputSx}
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
              ) : (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
                  <Button size="small" startIcon={<Refresh />} onClick={loadBookings} disabled={bookingsLoading}>
                    Refresh
                  </Button>
                </Box>
                {bookingsLoading ? (
                  <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : bookingsError ? (
                  <Alert severity="error" sx={{ borderRadius: 2 }}>
                    {bookingsError}
                  </Alert>
                ) : bookings.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    No bookings saved yet.
                  </Alert>
                ) : (
                  <Stack spacing={1.5}>
                    {bookings.map((booking, index) => (
                      <Card key={`${booking.savedAt || booking.date}-${index}`} variant="outlined" sx={{ borderRadius: 2, textAlign: 'left' }}>
                        <CardContent sx={{ p: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start', mb: 1 }}>
                            <Box>
                              <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                                {booking.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {booking.contact}
                              </Typography>
                            </Box>
                            <Chip label={booking.type || 'Booking'} color="primary" size="small" />
                          </Box>
                          <Divider sx={{ mb: 1.5 }} />
                          <Stack spacing={0.5}>
                            <Typography variant="body2" sx={{ color: '#1f2937' }}>
                              <strong>Address:</strong> {booking.address}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#1f2937' }}>
                              <strong>Date:</strong> {booking.date}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#1f2937' }}>
                              <strong>Time:</strong> {booking.time}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#1f2937' }}>
                              <strong>Processed By:</strong> {booking.processedBy}
                            </Typography>
                            {booking.savedAt && (
                              <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
                                Saved at {new Date(booking.savedAt).toLocaleString()}
                              </Typography>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Box>
              )}
              {message && (
                <Alert
                  severity={typeof message === 'string' && message.includes('successful') ? 'success' : 'error'}
                  sx={{ mt: 2, borderRadius: 2, fontSize: '0.9rem' }}
                >
                  {typeof message === 'object' && message !== null
                    ? (message.message || JSON.stringify(message))
                    : String(message)}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Container>
      </Box>
    </ThemeProvider>
    </LocalizationProvider>
  );
}

export default App;
