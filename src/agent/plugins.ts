// Every plugin's agent tools (each plugin folder's tools.ts). A plugin with no tools.ts offers
// agents its records (`collections`) and skills only.
import type { PluginTools } from './sdk';
import budgets from '../plugins/budgets/tools';
import invoices from '../plugins/invoices/tools';
import bills from '../plugins/bills/tools';
import bids from '../plugins/bids/tools';
import costing from '../plugins/costing/tools';

export const PLUGIN_TOOLS: PluginTools[] = [budgets, invoices, bills, bids, costing];
