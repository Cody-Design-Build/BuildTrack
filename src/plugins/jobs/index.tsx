import { Wrench } from 'lucide-react';
import { definePlugin } from '../sdk';
import Jobs from './Jobs';
import { DocumentsTab } from './JobDetail';

export default definePlugin({
  id: 'buildtrack.jobs',
  name: 'Jobs',
  description: 'Jobs, their status and the people on them. Everything else hangs off a job.',
  core: true,
  nav: [{ to: '/jobs', label: 'Jobs', icon: Wrench, group: 'work', order: 10 }],
  routes: [{ path: '/jobs', component: Jobs }],
  jobTabs: [{ id: 'documents', label: 'Documents', order: 90, component: DocumentsTab }],
});
