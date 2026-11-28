import { definePluginBase } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.jobs',
  name: 'Jobs',
  description: 'Jobs, their status and the people on them. Everything else hangs off a job.',
  core: true,
  collections: ['jobs', 'jobLinks'],
});
