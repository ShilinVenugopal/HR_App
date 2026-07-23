import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-5xl font-bold text-slate-300 dark:text-slate-700">404</p>
      <p className="mt-2 text-slate-500 dark:text-slate-400">Page not found</p>
      <Link to="/dashboard" className="btn-primary mt-4">
        Back to Dashboard
      </Link>
    </div>
  );
}
