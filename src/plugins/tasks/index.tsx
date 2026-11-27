import { Navigate, useLocation } from 'react-router-dom';
import { SquareCheck } from 'lucide-react';
import { definePlugin } from '../sdk';
import Tasks from './Tasks';
import { JobTasks } from './JobTasks';

function LegacyTasksRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/tasks', search, hash }} replace />;
}

export default definePlugin({
  id: 'buildtrack.tasks',
  name: 'Tasks',
  description: 'To-dos for the team, with types, due dates and assignees.',
  nav: [{ to: '/tasks', label: 'Tasks', icon: SquareCheck, group: 'work', order: 20 }],
  routes: [
    { path: '/tasks', component: Tasks },
    { path: '/to-dos', component: LegacyTasksRedirect },
  ],
  jobTabs: [{ id: 'tasks', label: 'Tasks', order: 80, component: JobTasks }],
  removeParty: (d, id) => ({ ...d, tasks: d.tasks.map((x) => (x.partyId === id ? { ...x, partyId: '' } : x)) }),
});
