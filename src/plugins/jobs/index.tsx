import { Wrench } from 'lucide-react';
import { definePlugin } from '../sdk';
import base from './base';
import Jobs from './Jobs';
import { DocumentsTab } from './JobDetail';

export default definePlugin({
  ...base,
  nav: [{ to: '/jobs', label: 'Jobs', icon: Wrench, group: 'work', order: 10 }],
  routes: [{ path: '/jobs', component: Jobs }],
  jobTabs: [{ id: 'documents', label: 'Documents', order: 90, component: DocumentsTab }],
});
