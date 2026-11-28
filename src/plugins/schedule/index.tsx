import { Calendar } from 'lucide-react';
import { definePlugin } from '../sdk';
import base from './base';
import Schedule from './Schedule';
import { JobSchedule } from './JobSchedule';

export default definePlugin({
  ...base,
  nav: [{ to: '/schedule', label: 'Schedule', icon: Calendar, group: 'work', order: 30 }],
  routes: [{ path: '/schedule', component: Schedule }],
  jobTabs: [{ id: 'schedule', label: 'Schedule', order: 70, component: JobSchedule }],
});
