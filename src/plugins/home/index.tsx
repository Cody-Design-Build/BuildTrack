import { House } from 'lucide-react';
import { definePlugin } from '../sdk';
import Home from './Home';

export default definePlugin({
  id: 'buildtrack.home',
  name: 'Home',
  description: 'The dashboard: what needs attention today and recent activity.',
  core: true,
  nav: [{ to: '/', label: 'Home', icon: House, group: 'work', order: 0 }],
  routes: [{ path: '/', component: Home }],
});
