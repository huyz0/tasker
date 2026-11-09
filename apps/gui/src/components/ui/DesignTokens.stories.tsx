import type { Meta, StoryObj } from '@storybook/react-vite';
import { TONE_CLASSES, taskTone } from './statusStyles';

const meta = { title: 'Design System/Visual Roles', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const OperationalWorkspace: Story = {
  render: () => (
    <div className="bg-surface-canvas p-panel flex flex-col gap-6">
      <h1 className="type-page-title">Agent work</h1>
      <section className="bg-surface-panel border rounded-lg p-panel flex flex-col gap-3">
        <h2 className="type-section-title">Ready for review</h2>
        <p className="type-body">Review outcomes, answer questions and help stalled work move forward.</p>
        <div className="min-h-row flex flex-wrap items-center gap-3">
          <span className="type-code">TASK-104</span>
          <span className="type-item-title">Confirm the release checklist</span>
          <span className="type-caption text-muted-foreground">Updated today</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {['todo', 'in-progress', 'done', 'custom review'].map(status => (
            <span key={status} className={`type-caption rounded-full px-2 py-0.5 ${TONE_CLASSES[taskTone(status)]}`}>{status}</span>
          ))}
        </div>
        <label className="type-label flex flex-col gap-2">Filter tasks<input className="h-control rounded-md border bg-surface-canvas px-3 type-body" placeholder="Filter by title…" /></label>
      </section>
      <section className="bg-surface-raised border rounded-lg p-panel">
        <h2 className="type-detail-title">Raised detail surface</h2>
        <p className="type-body">The same surface roles work in light and dark themes.</p>
      </section>
    </div>
  ),
};

/** Standalone error/action ink stays readable; destructive fill is separate. */
export const ErrorInkOnSurfaces: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {[
        ['Canvas', 'bg-surface-canvas'], ['Panel', 'bg-surface-panel'],
        ['Raised', 'bg-surface-raised'], ['Callout', 'bg-destructive-subtle'],
      ].map(([label, surface]) => (
        <section key={label} className={`${surface} rounded-md border p-panel`}>
          <h2 className="type-section-title">{label}</h2>
          <p className="type-body text-destructive-subtle-foreground">Could not save this change. Your writing is retained.</p>
          <button className="type-label text-destructive-subtle-foreground hover:underline focus-visible:ring-2 focus-visible:ring-primary">Delete draft</button>
        </section>
      ))}
    </div>
  ),
};
