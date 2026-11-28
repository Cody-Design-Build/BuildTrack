import { definePluginBase } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.tasks',
  name: 'Tasks',
  description: 'To-dos for the team, with types, due dates and assignees.',
  collections: ['tasks'],
  removeParty: (d, id) => ({ ...d, tasks: d.tasks.map((x) => (x.partyId === id ? { ...x, partyId: '' } : x)) }),
});
