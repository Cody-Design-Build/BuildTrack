import { Navigate, useLocation } from 'react-router-dom';
import { SquareCheck } from 'lucide-react';
import { definePlugin } from '../sdk';
import base from './base';
import Tasks from './Tasks';
import { JobTasks } from './JobTasks';

function LegacyTasksRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/tasks', search, hash }} replace />;
}

export default definePlugin({
  ...base,
  nav: [{ to: '/tasks', label: 'Tasks', icon: SquareCheck, group: 'work', order: 20 }],
  routes: [
    { path: '/tasks', component: Tasks },
    { path: '/to-dos', component: LegacyTasksRedirect },
  ],
  jobTabs: [{ id: 'tasks', label: 'Tasks', order: 80, component: JobTasks }],
});
