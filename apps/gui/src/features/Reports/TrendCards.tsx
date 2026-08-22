import { LineChart } from '../../components/charts/LineChart';
import { StackedAreaChart } from '../../components/charts/StackedAreaChart';
import { ReportPanel, TaskLink } from './ReportPanel';
import { agoLabel, collectedSinceFootnote } from './useReportsQueries';

// Narrower than the generated `GetReportTrendsResponse` — the same tradeoff
// every feature file here makes (see Handoffs/index.tsx). Kept structural so
// stories and tests can build fixtures without the protobuf Message wrapper.
export type TrendsData = {
  /** ISO date the activity log started collecting — every chart labels it. */
  collectedSince: string;
  createdCumulative: { date: string; count: bigint }[];
  completedCumulative: { date: string; count: bigint }[];
  recentCompletions: {
    taskId: string;
    taskDisplayId: string;
    taskTitle: string;
    completedAt: string;
    byAgent: boolean;
  }[];
  autonomyRate: { date: string; rate: number; sampleSize: bigint }[];
  reworkRate: { date: string; rate: number; sampleSize: bigint }[];
  /** Bottom-first, as delivered — the terminal band is the floor of the stack. */
  cfdBands: { status: string; isTerminal: boolean; counts: { date: string; count: bigint }[] }[];
  cfdTaskTypeId: string;
  taskTypeOptions: { id: string; name: string; taskCount: bigint }[];
};

/** Rates travel 0..1; everything visible about them reads as a percentage. */
const percent = (value: number): string => `${Math.round(value * 100)}%`;

const countPoints = (counts: { date: string; count: bigint }[]) =>
  counts.map((c) => ({ date: c.date, value: Number(c.count) }));

/**
 * Card 5 — are agents finishing work without a human stepping in, and is
 * finished work staying finished?
 */
function AutonomyReworkCard({ trends }: { trends: TrendsData }) {
  const footnote = collectedSinceFootnote(trends.collectedSince);

  // A rate only means something on a day that had completions to measure.
  // The series keep every day (dropping no-sample days would tear the line
  // apart), but the card says how many days actually carry signal — and when
  // none do, an all-zero line would be a lie ("0% autonomous" about nothing),
  // so the chart's honest empty message renders instead.
  const sampledDays = trends.autonomyRate.filter(
    (day, i) => Number(day.sampleSize) > 0 || Number(trends.reworkRate[i].sampleSize) > 0,
  ).length;

  // Chart tokens: 6 is the palette's success-anchored green — autonomy rising
  // is the good line, and it matches the green "completed" line next door —
  // and 3 is the amber: rework is a warning sign, not yet a failure.
  const series = [
    { label: 'Autonomous completions', colorToken: 6 as const, points: trends.autonomyRate.map((d) => ({ date: d.date, value: d.rate })) },
    { label: 'Reworked completions', colorToken: 3 as const, points: trends.reworkRate.map((d) => ({ date: d.date, value: d.rate })) },
  ];

  return (
    <ReportPanel
      title="Autonomy and rework"
      subtitle="Whether agents finish work unaided, and whether it stays finished — who needs closer review"
    >
      <div className="flex flex-col gap-1 p-2">
        {sampledDays === 0 ? (
          <LineChart
            title="Autonomy and rework"
            description="Share of each day's completions done autonomously, and share later reworked."
            series={[]}
            footnote={footnote}
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {sampledDays} {sampledDays === 1 ? 'day' : 'days'} with completions in this window
            </p>
            <LineChart
              title="Autonomy and rework"
              description="Share of each day's completions done autonomously, and share later reworked."
              series={series}
              yFormat={percent}
              footnote={footnote}
            />
          </>
        )}
      </div>
    </ReportPanel>
  );
}

/** Card 6 — is the project draining or filling, and what just got done. */
function CreatedCompletedCard({ trends }: { trends: TrendsData }) {
  return (
    <ReportPanel
      title="Created vs completed"
      subtitle="Whether work is draining or piling up — the gap between the lines is the backlog growing"
    >
      <div className="flex flex-col gap-1 p-2">
        <LineChart
          title="Created vs completed"
          description="Cumulative tasks created and completed per day; the gap is the open backlog."
          series={[
            // Token 5 is the palette's blue — created work is neutral inflow —
            // and 6 the success green, the same "done" green as the other cards.
            { label: 'Created', colorToken: 5, points: countPoints(trends.createdCumulative) },
            { label: 'Completed', colorToken: 6, points: countPoints(trends.completedCumulative) },
          ]}
          footnote={collectedSinceFootnote(trends.collectedSince)}
        />
        <h3 className="px-2 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent completions
        </h3>
        {trends.recentCompletions.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">Nothing completed in this window yet.</p>
        ) : (
          <ul className="divide-y">
            {/* Server-capped, but "up to 10" is this card's promise, not the wire's. */}
            {trends.recentCompletions.slice(0, 10).map((c) => (
              <li key={c.taskId} className="flex items-center justify-between gap-2 p-2">
                <TaskLink taskId={c.taskId} displayId={c.taskDisplayId} title={c.taskTitle} />
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{agoLabel(c.completedAt)}</span>
                  {/* Swatchless on purpose: who completed it is a fact, not a verdict. */}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {c.byAgent ? 'agent' : 'human'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ReportPanel>
  );
}

/** Card 7 — the cumulative flow diagram, scoped to one task type. */
function FlowCard({ trends, taskTypeId, onTaskTypeChange }: {
  trends: TrendsData;
  /** Local override; undefined means "the server's pick", shown as selected. */
  taskTypeId?: string;
  onTaskTypeChange: (taskTypeId: string) => void;
}) {
  // Non-terminal bands cycle tokens 1–5 by position; the terminal band always
  // takes 6, the success-anchored green — done work reads as the same colour
  // everywhere on this screen, and cycling only five keeps a busy status
  // vocabulary from colliding with it.
  const bands = trends.cfdBands.map((band, i) => ({
    label: band.status,
    colorToken: band.isTerminal ? 6 : (i % 5) + 1,
    points: countPoints(band.counts),
  }));

  return (
    <ReportPanel
      title="Flow"
      subtitle="Where tasks of one type sit over time — a swelling middle band is where work is queuing"
    >
      <div className="flex flex-col gap-2 p-2">
        <label className="flex items-center gap-2 self-start text-xs text-muted-foreground">
          Task type
          <select
            value={taskTypeId ?? trends.cfdTaskTypeId}
            onChange={(event) => onTaskTypeChange(event.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm text-foreground"
          >
            {trends.taskTypeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {`${option.name} (${Number(option.taskCount)})`}
              </option>
            ))}
          </select>
        </label>
        <StackedAreaChart
          title="Cumulative flow"
          description="Tasks of the selected type in each status per day, stacked, terminal status at the bottom."
          bands={bands}
          footnote={collectedSinceFootnote(trends.collectedSince)}
        />
      </div>
    </ReportPanel>
  );
}

/**
 * The three T09 trend cards, purely presentational — `TrendsSection` owns the
 * query, so stories and most tests can drive every state from fixture props
 * (the container/presentational split frontend-standard mandates).
 */
export function TrendCards({ trends, taskTypeId, onTaskTypeChange }: {
  trends: TrendsData;
  taskTypeId?: string;
  onTaskTypeChange: (taskTypeId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AutonomyReworkCard trends={trends} />
      <CreatedCompletedCard trends={trends} />
      <FlowCard trends={trends} taskTypeId={taskTypeId} onTaskTypeChange={onTaskTypeChange} />
    </div>
  );
}
