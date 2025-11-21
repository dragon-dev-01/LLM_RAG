import { Typography, Button, Grid } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddTwoToneIcon from '@mui/icons-material/AddTwoTone';
import { useEffect, useState } from 'react';

function PageHeader() {
  const navigate = useNavigate();
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
  return (
    <Grid container justifyContent="space-between" alignItems="center">
      <Grid item>
        <Typography variant="h3" component="h3" gutterBottom>
          Transactions
        </Typography>
        <Typography variant="subtitle2">
          {user?.name? `${user?.name}, these are your recent finetuning transactions`: 'Please sign in to see your finetuning transactions'}
        </Typography>
      </Grid>
      <Grid item>
        <Button
          sx={{ mt: { xs: 2, md: 0 } }}
          variant="contained"
          startIcon={<AddTwoToneIcon fontSize="small" />}
          onClick={() => navigate('/')}
        >
          Train Model
        </Button>
      </Grid>
    </Grid>
  );
}

export default PageHeader;
