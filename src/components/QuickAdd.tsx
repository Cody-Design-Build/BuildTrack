import { useState } from 'react';
import { Wrench, SquareCheck, Users, Truck } from 'lucide-react';
import { Modal } from './Layout';
import { AccountForm, JobForm, TodoForm } from './Forms';

export function QuickAdd({ onClose }: { onClose: () => void }) {
  const [what, setWhat] = useState<'' | 'job' | 'todo' | 'customer' | 'vendor'>('');
  if (what === 'job') return <JobForm onClose={onClose} />;
  if (what === 'todo') return <TodoForm onClose={onClose} />;
  if (what === 'customer' || what === 'vendor') return <AccountForm type={what} onClose={onClose} />;
  return (
    <Modal title="Add new" onClose={onClose}>
      <div className="quick-grid">
        <button type="button" className="quick" onClick={() => setWhat('job')}><Wrench size={20} /> Job</button>
        <button type="button" className="quick" onClick={() => setWhat('todo')}><SquareCheck size={20} /> To-Do</button>
        <button type="button" className="quick" onClick={() => setWhat('customer')}><Users size={20} /> Customer account</button>
        <button type="button" className="quick" onClick={() => setWhat('vendor')}><Truck size={20} /> Vendor account</button>
      </div>
    </Modal>
  );
}
