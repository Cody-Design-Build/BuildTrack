import { useState } from 'react';
import { Wrench, SquareCheck, User, Building2 } from 'lucide-react';
import { Modal } from './Layout';
import { AccountForm, JobForm, PersonForm, TodoForm } from './Forms';

export function QuickAdd({ onClose }: { onClose: () => void }) {
  const [what, setWhat] = useState<'' | 'job' | 'todo' | 'person' | 'account'>('');
  if (what === 'job') return <JobForm onClose={onClose} />;
  if (what === 'todo') return <TodoForm onClose={onClose} />;
  if (what === 'person') return <PersonForm onClose={onClose} />;
  if (what === 'account') return <AccountForm onClose={onClose} />;
  return (
    <Modal title="Add new" onClose={onClose}>
      <div className="quick-grid">
        <button type="button" className="quick" onClick={() => setWhat('job')}><Wrench size={20} /> Job</button>
        <button type="button" className="quick" onClick={() => setWhat('todo')}><SquareCheck size={20} /> To-Do</button>
        <button type="button" className="quick" onClick={() => setWhat('person')}><User size={20} /> Person</button>
        <button type="button" className="quick" onClick={() => setWhat('account')}><Building2 size={20} /> Account</button>
      </div>
    </Modal>
  );
}
