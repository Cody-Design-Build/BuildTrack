import { House } from 'lucide-react';
import { definePlugin } from '../sdk';
import base from './base';
import Home from './Home';

export default definePlugin({
  ...base,
  nav: [{ to: '/', label: 'Home', icon: House, group: 'work', order: 0 }],
  routes: [{ path: '/', component: Home }],
});
