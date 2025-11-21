import ReactDOM from 'react-dom';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';

import 'nprogress/nprogress.css';
import App from 'src/App';
import { SidebarProvider } from 'src/contexts/SidebarContext';
import * as serviceWorker from 'src/serviceWorker';
import { GoogleOAuthProvider } from '@react-oauth/google';


// Development mode: Bypass Google OAuth if configured
const clientId = process.env.REACT_APP_BYPASS_LOGIN === 'true' 
  ? 'dev-bypass' 
  : (process.env.REACT_APP_GOOGLE_CLIENT_ID || '');

const AppWrapper = () => (
  <HelmetProvider>
    <SidebarProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SidebarProvider>
  </HelmetProvider>
);

// Only wrap with GoogleOAuthProvider if not bypassing
if (process.env.REACT_APP_BYPASS_LOGIN === 'true') {
  ReactDOM.render(<AppWrapper />, document.getElementById('root'));
} else {
  ReactDOM.render(
    <GoogleOAuthProvider clientId={clientId}>
      <AppWrapper />
    </GoogleOAuthProvider>,
    document.getElementById('root')
  );
}

serviceWorker.unregister();
