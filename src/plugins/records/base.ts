import { definePluginBase } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.records',
  name: 'Records',
  description: 'Documents, the catalog, files and reports.',
  core: true,
  collections: ['docs', 'activity'],
});
