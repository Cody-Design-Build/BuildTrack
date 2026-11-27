import { Calendar } from 'lucide-react';
import { definePlugin } from '../sdk';
import Schedule from './Schedule';
import { JobSchedule } from './JobSchedule';

export default definePlugin({
  id: 'buildtrack.schedule',
  name: 'Schedule',
  description: 'Who is working where and when, as a Gantt chart or a list.',
  nav: [{ to: '/schedule', label: 'Schedule', icon: Calendar, group: 'work', order: 30 }],
  routes: [{ path: '/schedule', component: Schedule }],
  jobTabs: [{ id: 'schedule', label: 'Schedule', order: 70, component: JobSchedule }],
});
