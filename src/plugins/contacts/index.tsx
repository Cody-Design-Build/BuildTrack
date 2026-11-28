import { Navigate } from 'react-router-dom';
import { Building2, Users } from 'lucide-react';
import { definePlugin } from '../sdk';
import base from './base';
import People from './People';
import Accounts from './Accounts';

export default definePlugin({
  ...base,
  nav: [
    { to: '/people', label: 'People', icon: Users, group: 'records', order: 20 },
    { to: '/accounts', label: 'Accounts', icon: Building2, group: 'records', order: 30 },
  ],
  routes: [
    { path: '/people', component: People },
    { path: '/accounts', component: Accounts },
    // old addresses from the customer/vendor pages
    { path: '/customers', component: () => <Navigate to="/accounts?type=Customer" replace /> },
    { path: '/vendors', component: () => <Navigate to="/accounts?type=Vendor" replace /> },
  ],
});
