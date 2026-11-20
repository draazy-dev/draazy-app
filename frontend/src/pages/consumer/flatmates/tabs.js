export const TAB_MOVE_IN = 'move-in';
export const TAB_PEOPLE = 'people';
export const TAB_TEAMS = 'teams';
export const TAB_TEAM_UP = 'team-up';
export const TABS = [TAB_MOVE_IN, TAB_PEOPLE, TAB_TEAMS];
export const TAB_ICON = { [TAB_MOVE_IN]: 'door-open', [TAB_PEOPLE]: 'user-search', [TAB_TEAMS]: 'users-round' };
export const KIND_WORD = { [TAB_MOVE_IN]: 'homes', [TAB_PEOPLE]: 'flatmates', [TAB_TEAMS]: 'teams' };

const TAB_ALIAS = {
  rooms: TAB_MOVE_IN,
  flatmates: TAB_PEOPLE,
  [TAB_TEAM_UP]: TAB_PEOPLE,
  groups: TAB_TEAMS,
};
export const normalizeTab = (v) => (TABS.includes(v) ? v : TAB_ALIAS[v] || TAB_MOVE_IN);
