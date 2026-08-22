import { useState } from 'react';
import { sinceLabel } from '../../lib/sinceLabel';
import { ReportPanel } from './ReportPanel';

// Narrower than the generated `FleetScorecardRow` message — the same tradeoff
// every feature file here makes (see Handoffs/index.tsx).
export type ScorecardRow = {
  subjectId: string;
  /** "(deleted agent)" when the agent has been purged — rendered as given. */
  subjectName: string;
  claimed: bigint;
  completed: bigint;
  reopened: bigint;
  handedOff: bigint;
  takenAway: bigint;
  autonomousCompleted: bigint;
  openNow: bigint;
  lastActiveAt?: string;
};

const COLUMNS: Array<{ label: string; value: (r: ScorecardRow) => number }> = [
  { label: 'Claimed', value: (r) => Number(r.claimed) },
  { label: 'Completed', value: (r) => Number(r.completed) },
  { label: 'Reopened', value: (r) => Number(r.reopened) },
  { label: 'Handed off', value: (r) => Number(r.handedOff) },
  { label: 'Taken away', value: (r) => Number(r.takenAway) },
  { label: 'Autonomous', value: (r) => Number(r.autonomousCompleted) },
  { label: 'Open now', value: (r) => Number(r.openNow) },
];

/**
 * Card 4 — outcomes per agent or per role, trust over volume. The role view
 * exists because the role (its systemPrompt/capabilities) is the
 * *configurable* unit: a per-role reopen rate is a prompt change, a per-agent
 * one is an anecdote.
 */
export function FleetScorecardCard({ agentRows, roleRows }: {
  agentRows: ScorecardRow[];
  roleRows: ScorecardRow[];
}) {
  const [grouping, setGrouping] = useState<'agents' | 'roles'>('agents');
  const rows = grouping === 'agents' ? agentRows : roleRows;

  const toggle = (
    <div role="group" aria-label="Scorecard grouping" className="flex shrink-0 gap-0.5 rounded-md border p-0.5">
      {(['agents', 'roles'] as const).map((mode) => (
        <button
          key={mode}
          aria-pressed={grouping === mode}
          onClick={() => setGrouping(mode)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            grouping === mode
              ? 'bg-primary-subtle text-primary-subtle-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {mode === 'agents' ? 'Agents' : 'Roles'}
        </button>
      ))}
    </div>
  );

  return (
    <ReportPanel
      title="Fleet scorecard"
      subtitle="Outcomes per agent and per role — who to trust with what, worst first"
      action={toggle}
    >
      {rows.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">
          No {grouping === 'agents' ? 'agent' : 'role'} activity recorded in this window.
        </p>
      ) : (
        // The table is wider than a phone; it scrolls inside the card rather
        // than forcing the page wider than the viewport.
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="p-2 text-left font-medium">Name</th>
                {COLUMNS.map((col) => (
                  <th key={col.label} scope="col" className="p-2 text-right font-medium">{col.label}</th>
                ))}
                <th scope="col" className="p-2 text-right font-medium">Last active</th>
              </tr>
            </thead>
            {/* Rows render exactly in server order — the handler sorts worst
                reopen rate first, and re-sorting here would quietly disagree
                with it. */}
            <tbody>
              {rows.map((r) => (
                <tr key={r.subjectId} className="border-t">
                  <td className="p-2 whitespace-nowrap">{r.subjectName}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.label} className="p-2 text-right tabular-nums">{col.value(r)}</td>
                  ))}
                  <td className="p-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                    {sinceLabel(r.lastActiveAt).text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportPanel>
  );
}
