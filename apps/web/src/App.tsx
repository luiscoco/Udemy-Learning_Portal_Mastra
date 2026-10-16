import { catalog } from '@mlp/lab-catalog';
import { HealthStatus } from './components/HealthStatus';

export function App() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Mastra Learning Platform</h1>
      <p className="mt-2 text-slate-600">Mastra AI Agents 2026 — interactive course labs.</p>

      <section aria-labelledby="health-heading" className="mt-8 rounded-xl border border-slate-200 p-5">
        <h2 id="health-heading" className="mb-3 text-lg font-medium">
          Platform status
        </h2>
        <HealthStatus />
      </section>

      <section aria-labelledby="labs-heading" className="mt-8">
        <h2 id="labs-heading" className="mb-3 text-lg font-medium">
          Available labs
        </h2>
        <ul className="space-y-2">
          {catalog.labs
            .filter((l) => l.status === 'available')
            .map((lab) => (
              <li key={lab.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <span className="font-mono text-sm text-slate-500">{lab.id}</span> {lab.title}
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}
