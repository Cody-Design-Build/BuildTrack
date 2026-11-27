// Every installed plugin. To add your own, put it in a folder here and add it to this list.
// Order doesn't matter: menus, tabs and sections are sorted by their `order` numbers.
import type { Plugin } from './sdk';
import home from './home';
import jobs from './jobs';
import contacts from './contacts';
import records from './records';
import tasks from './tasks';
import schedule from './schedule';
import budgets from './budgets';
import bids from './bids';
import invoices from './invoices';
import bills from './bills';
import expenses from './expenses';
import costing from './costing';
import themesBuiltin from './themes-builtin';
import themesOmarchy from './themes-omarchy';

export const PLUGINS: Plugin[] = [home, jobs, contacts, records, tasks, schedule, budgets, bids, invoices, bills, expenses, costing, themesBuiltin, themesOmarchy];
