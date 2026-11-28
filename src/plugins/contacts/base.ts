import { definePluginBase } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.contacts',
  name: 'Contacts',
  description: 'People and companies: customers, vendors, subcontractors and anyone else on a job.',
  core: true,
  collections: ['people', 'accounts', 'memberships'],
});
