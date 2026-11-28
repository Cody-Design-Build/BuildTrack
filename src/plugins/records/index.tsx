import { Book, ChartPie, FileText, Folder } from 'lucide-react';
import { definePlugin } from '../sdk';
import base from './base';
import { Documents, Placeholder, Reports } from '../../pages/Other';

export default definePlugin({
  ...base,
  nav: [
    { to: '/documents', label: 'Documents', icon: FileText, group: 'records', order: 10 },
    { to: '/catalog', label: 'Catalog', icon: Book, group: 'records', order: 40 },
    { to: '/files', label: 'Files', icon: Folder, group: 'records', order: 50 },
    { to: '/reports', label: 'Reports', icon: ChartPie, group: 'insights', order: 10 },
  ],
  routes: [
    { path: '/documents', component: Documents },
    { path: '/reports', component: Reports },
    { path: '/catalog', component: () => <Placeholder title="Catalog" text="Your saved cost items and assemblies will live here." /> },
    { path: '/files', component: () => <Placeholder title="Files" text="Photos, plans and uploads for your jobs will live here." /> },
  ],
});
