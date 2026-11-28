// Every installed plugin without its screens (each folder's base.ts). The agent server
// (src/agent/) uses this list; the app uses index.ts, which adds the screens. Keep the two in step:
// `npm run test:agent` checks they list the same plugins.
import type { PluginBase } from './sdk';
import home from './home/base';
import jobs from './jobs/base';
import contacts from './contacts/base';
import records from './records/base';
import tasks from './tasks/base';
import schedule from './schedule/base';
import budgets from './budgets/base';
import bids from './bids/base';
import invoices from './invoices/base';
import bills from './bills/base';
import expenses from './expenses/base';
import costing from './costing/base';

export const PLUGIN_BASES: PluginBase[] = [home, jobs, contacts, records, tasks, schedule, budgets, bids, invoices, bills, expenses, costing];
