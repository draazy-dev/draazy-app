import { useState } from 'react';
import { SubNav } from './components.jsx';
import RecentPanel from './RecentPanel.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import FollowedSocietiesPanel from './FollowedSocietiesPanel.jsx';
import MyFlatmateGroupsPanel from './MyFlatmateGroupsPanel.jsx';
/* What the seeker is tracking; saved homes live on /saved, behind the top-bar heart. */

const ITEMS = [
  { key: 'alerts', label: 'Alerts', icon: 'bell-plus' },
  { key: 'recent', label: 'Recently Viewed', icon: 'history' },
  { key: 'groups', label: 'Flatmate groups', icon: 'users-round' },
];

export default function ActivityPanel({ initialSub, recent = [] }) {
  const [sub, setSub] = useState(ITEMS.some((i) => i.key === initialSub) ? initialSub : 'alerts');
  return (
    <div>
      <SubNav items={ITEMS} active={sub} onChange={setSub} />
      {sub === 'recent' && <RecentPanel recent={recent} />}
      {sub === 'groups' && <MyFlatmateGroupsPanel />}
      {sub === 'alerts' && (
        <div className="space-y-5">
          <AlertsPanel />
          <FollowedSocietiesPanel />
        </div>
      )}
    </div>
  );
}
