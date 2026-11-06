import { createRoot } from 'react-dom/client';
import App from './App';

const mountContainer = document.getElementById('anvora-react-root');
if (mountContainer) {
  const root = createRoot(mountContainer);
  root.render(<App />);
}
