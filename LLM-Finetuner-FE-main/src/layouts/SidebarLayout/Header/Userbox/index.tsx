import { useRef, useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Divider,
  Hidden,
  lighten,
  List,
  ListItem,
  ListItemText,
  Popover,
  Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import ExpandMoreTwoToneIcon from '@mui/icons-material/ExpandMoreTwoTone';
import AccountBoxTwoToneIcon from '@mui/icons-material/AccountBoxTwoTone';
import InboxTwoToneIcon from '@mui/icons-material/InboxTwoTone';
import AccountTreeTwoToneIcon from '@mui/icons-material/AccountTreeTwoTone';
import LockOpenTwoToneIcon from '@mui/icons-material/LockOpenTwoTone';
import { GoogleLogin } from '@react-oauth/google';

// 1) Our styled components
const UserBoxButton = styled(Button)(
  ({ theme }) => `
    padding-left: ${theme.spacing(1)};
    padding-right: ${theme.spacing(1)};
`
);

const MenuUserBox = styled(Box)(
  ({ theme }) => `
    background: ${theme.colors.alpha.black[5]};
    padding: ${theme.spacing(2)};
`
);

const UserBoxText = styled(Box)(
  ({ theme }) => `
    text-align: left;
    padding-left: ${theme.spacing(1)};
`
);

const UserBoxLabel = styled(Typography)(
  ({ theme }) => `
    font-weight: ${theme.typography.fontWeightBold};
    color: ${theme.palette.secondary.main};
    display: block;
`
);

const UserBoxDescription = styled(Typography)(
  ({ theme }) => `
    color: ${lighten(theme.palette.secondary.main, 0.5)}
`
);

function HeaderUserbox() {
  const [user, setUser] = useState<{
    id: number;
    name: string;
    email: string;
    picture: string;
  } | null>(null);

  const API_HOST = process.env.REACT_APP_API_HOST; 

  const ref = useRef<any>(null);
  const [isOpen, setOpen] = useState<boolean>(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleOpen = (): void => {
    setOpen(true);
  };
  const handleClose = (): void => {
    setOpen(false);
  };

  // 4) Sign-out logic
  const handleSignOut = () => {
    localStorage.removeItem('user');
    setUser(null);
    window.location.reload();
  };

  const displayName = user ? user.name : 'Sign in';
  const avatarSrc = user ? user.picture : '/static/images/avatars/default.png';


  return (
    <>
      <UserBoxButton color="secondary" ref={ref} onClick={handleOpen}>
        <Avatar variant="rounded" alt={displayName} src={avatarSrc} />
        <Hidden mdDown>
          <UserBoxText>
            <UserBoxLabel variant="body1">{displayName}</UserBoxLabel>
            <UserBoxDescription variant="body2">
              {user ? user.email : ''}
            </UserBoxDescription>
          </UserBoxText>
        </Hidden>
        <Hidden smDown>
          <ExpandMoreTwoToneIcon sx={{ ml: 1 }} />
        </Hidden>
      </UserBoxButton>

      <Popover
        anchorEl={ref.current}
        onClose={handleClose}
        open={isOpen}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right'
        }}
      >
        {!user && (
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">Please Sign In</Typography>
            {/* Development mode: Bypass login */}
            {process.env.REACT_APP_BYPASS_LOGIN === 'true' ? (
              <Box>
                <button
                  onClick={async () => {
                    try {
                      // Call backend bypass login endpoint
                      const resp = await fetch(`${API_HOST}/api/login/google`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          credential: 'bypass' // Dummy credential for bypass mode
                        })
                      });
                      const data = await resp.json();
                      if (data.user) {
                        localStorage.setItem('user', JSON.stringify(data.user));
                        setUser(data.user);
                        window.location.reload();
                      }
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#1976d2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Login as Test User (Dev Mode)
                </button>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                  Development mode: Login bypassed
                </Typography>
              </Box>
            ) : (
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  // 1) Send credential to your backend
                  try {
                    const resp = await fetch(`${API_HOST}/api/login/google`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        credential: credentialResponse.credential
                      })
                    });
                    const data = await resp.json();
                    if (data.user) {
                      // 2) Save user in local storage
                      localStorage.setItem('user', JSON.stringify(data.user));
                      setUser(data.user);

                      window.location.reload();
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }}
                onError={() => console.log('Login Failed')}
                useOneTap
              />
            )}
          </Box>
        )}


        {/* If user is logged in, show the user info + sign out */}
        {user && (
          <>
            <MenuUserBox sx={{ minWidth: 210 }} display="flex">
              <Avatar variant="rounded" alt={user.name} src={user.picture} />
              <UserBoxText>
                <UserBoxLabel variant="body1">{user.name}</UserBoxLabel>
                <UserBoxDescription variant="body2">
                  {user.email}
                </UserBoxDescription>
              </UserBoxText>
            </MenuUserBox>
            <Divider sx={{ mb: 0 }} />
            <List sx={{ p: 1 }} component="nav">
              <ListItem button to="/" component={NavLink} disabled>
                <AccountBoxTwoToneIcon fontSize="small" />
                <ListItemText primary="My Profile" />
              </ListItem>

              <ListItem button to="/" component={NavLink} disabled>
                <AccountTreeTwoToneIcon fontSize="small" />
                <ListItemText primary="Account Settings" />
              </ListItem>
            </List>
            <Divider />
            <Box sx={{ m: 1 }}>
              <Button color="primary" fullWidth onClick={handleSignOut}>
                <LockOpenTwoToneIcon sx={{ mr: 1 }} />
                Sign out
              </Button>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
}

export default HeaderUserbox;
