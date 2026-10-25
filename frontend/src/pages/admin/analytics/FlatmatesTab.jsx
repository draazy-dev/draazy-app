import { BarChart, LineChart } from '../../../components/charts/index.jsx';
import { fmtNum } from '../../../lib/format.js';
import { C, AX, axis, Card, LoadFailedNotice } from './constants.jsx';

const sum = (weeks, key) => weeks.reduce((s, w) => s + w[key], 0);
const pct = (v) => (v == null ? '—' : `${v}%`);

function Kpi({ id, value, label, note }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4" data-testid={`flatmates-${id}`}>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {note ? <div className="text-[11px] mt-1 text-gray-400">{note}</div> : null}
    </div>
  );
}

export default function FlatmatesTab({ report, failed, days }) {
  if (failed) {
    return (
      <LoadFailedNotice>
        The flatmates report did not answer, so no posts, requests or reply rates are shown — don&apos;t read this as a quiet week.
      </LoadFailedNotice>
    );
  }
  if (!report) return null;

  const { weeks, replies, localities } = report;
  const labels = weeks.map((w) => w.week);
  const posts = sum(weeks, 'rooms') + sum(weeks, 'groups') + sum(weeks, 'seekers');

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi id="posts" value={fmtNum(posts)} label="New posts" note={`${fmtNum(sum(weeks, 'seekers'))} seekers`} />
        <Kpi id="requests" value={fmtNum(replies.sent)} label="Requests sent" />
        <Kpi id="matches" value={fmtNum(sum(weeks, 'matches'))} label="Matches" note="accepted & joins" />
        <Kpi id="reply-rate" value={pct(replies.replyRatePct)} label="Replied within 48h" note={`${pct(replies.acceptRatePct)} accepted`} />
        <Kpi id="median-reply" value={replies.medianReplyHours == null ? '—' : `${replies.medianReplyHours}h`} label="Median reply time" />
        <Kpi id="unanswered" value={fmtNum(replies.unansweredNow)} label="Unanswered over 48h" note="right now" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="New posts by week" desc={`Rooms, groups and seekers · last ${days} days`}>
          <BarChart
            labels={labels}
            datasets={[
              { label: 'Rooms', data: weeks.map((w) => w.rooms), color: C.teal },
              { label: 'Groups', data: weeks.map((w) => w.groups), color: C.violet },
              { label: 'Seekers', data: weeks.map((w) => w.seekers), color: C.indigo },
            ]}
            options={{ scales: { x: { ...AX, stacked: true }, y: axis({ stacked: true, beginAtZero: true, ticks: { precision: 0 } }) } }}
          />
        </Card>
        <Card title="Requests and matches" desc={`Per week · last ${days} days`}>
          <LineChart
            labels={labels}
            datasets={[
              { label: 'Requests', data: weeks.map((w) => w.requests), color: C.amber, fill: false },
              { label: 'Matches', data: weeks.map((w) => w.matches), color: C.emerald, fill: false },
            ]}
            options={{ scales: { x: AX, y: axis({ beginAtZero: true, ticks: { precision: 0 } }) } }}
          />
        </Card>
      </div>

      <Card title="Host reply rate" desc="Requests answered within 48h, by the week they were sent">
        <LineChart
          labels={labels}
          datasets={[{ label: 'Replied %', data: weeks.map((w) => w.replyRatePct), color: C.coral, fill: true }]}
          options={{ scales: { x: AX, y: axis({ min: 0, max: 100, ticks: { callback: (v) => `${v}%` } }) } }}
        />
      </Card>

      <div className="dz-card p-5">
        <h3 className="font-bold">Supply vs demand by locality</h3>
        <div className="mb-3 text-xs text-gray-400">Live posts now. Biggest shortfall first.</div>
        {localities.length ? (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- named scroll region
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Supply versus demand by locality">
            <table className="w-full text-sm" data-testid="flatmates-localities">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-white/10">
                  <th scope="col" className="text-left py-2 font-medium">Locality</th>
                  <th scope="col" className="text-right py-2 font-medium" title="Live rooms and groups with a flat">Supply</th>
                  <th scope="col" className="text-right py-2 font-medium" title="Live seekers and hunting groups">Demand</th>
                  <th scope="col" className="text-right py-2 font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {localities.map((l) => {
                  const gap = l.demand - l.supply;
                  return (
                    <tr key={l.locality} className="border-b border-white/5">
                      <td className="py-2.5 text-white font-medium"><span className="block max-w-[14rem] truncate" title={l.locality}>{l.locality}</span></td>
                      <td className="py-2.5 text-right tabular-nums text-teal-300">{l.supply}</td>
                      <td className="py-2.5 text-right tabular-nums text-indigo-300">{l.demand}</td>
                      <td className={`py-2.5 text-right tabular-nums font-semibold ${gap > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{gap > 0 ? `+${gap}` : gap}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-500">No live flatmate post names a locality yet.</p>
        )}
      </div>
    </div>
  );
}
