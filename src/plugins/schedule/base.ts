import { definePluginBase } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.schedule',
  name: 'Schedule',
  description: 'Who is working where and when, as a Gantt chart or a list.',
  collections: ['scheduleEntries'],
});
