const LISTING = {
  contact: {
    seeker: (deal) => [
      'Is it still available?',
      'When can I come for a visit?',
      deal === 'rent' ? 'What are the deposit and maintenance?' : 'Is the price negotiable?',
    ],
    owner: () => ["Yes, it's still available", 'When would you like to visit?', "Sorry, it's no longer available"],
  },
  visit: {
    seeker: () => ['Please share the location pin', 'Who should I ask for when I arrive?', 'I need to reschedule the visit'],
    owner: () => ["I'll share the location pin", 'See you then', 'Can we move the visit to another time?'],
  },
  visited: {
    seeker: (deal) => (deal === 'rent'
      ? ['I liked the place. Is the rent negotiable?', 'When can I move in?', 'What documents do you need from me?']
      : ['I liked the place. Is the price negotiable?', 'Can you share the property papers?', 'Can I get a home loan on this property?']),
    owner: () => ['Thanks for visiting. Did you like the place?'],
  },
  offer: {
    seeker: (deal) => (deal === 'rent'
      ? ['When can we sign the rent agreement?', 'When can I move in?', 'When do I pay the deposit?']
      : ['What are the next steps?', 'Can you share the property papers?', 'When can we meet to finalise?']),
    owner: (deal) => (deal === 'rent'
      ? ["Let's fix a date for the agreement", 'When would you like to move in?', 'Please share your ID for the agreement']
      : ["I'll share the property papers", 'When can we meet to finalise?', 'Will you need a home loan?']),
  },
};

const FLATMATE = {
  room: {
    asker: ['Is the room still available?', 'When can I come to see the room?', "What's included in the rent?"],
    poster: ['Yes, the room is available', 'When can you come to see it?', 'When are you planning to move in?'],
  },
  post: {
    asker: ['When are you planning to move in?', "What's your budget?", 'Would you like to see the place?'],
    poster: ['Where is the place?', "What's the rent per person?", 'When can I see it?'],
  },
};

const withBox = (boxes) => [
  ...boxes.sent.items.map((item) => ({ item, box: 'sent' })),
  ...boxes.received.items.map((item) => ({ item, box: 'received' })),
];

// Chips are for opening a chat: it is your turn and you have written nothing beyond the opener that started it.
function yourOpening(messages) {
  if (messages.at(-1)?.from === 'me') return false;
  const mine = messages.filter((m) => m.from === 'me').length;
  return mine <= (messages[0]?.from === 'me' ? 1 : 0);
}

function listingCase(conv, rows, now) {
  const accepted = (kind) => rows.filter(({ item }) => item.kind === kind && item.state === 'accepted'
    && item.target?.id === conv.propertyId && item.party?.id === conv.party?.id);
  if (accepted('offer').length) return 'offer';
  const visits = accepted('visit');
  if (visits.some(({ item }) => Date.parse(item.slot) > now)) return 'visit';
  return visits.length ? 'visited' : 'contact';
}

function listingReplies(conv, rows, now) {
  if (conv.property?.available === false) return [];
  const side = conv.youAre === 'owner' ? 'owner' : 'seeker';
  return LISTING[listingCase(conv, rows, now)][side](conv.property?.deal);
}

function flatmateReplies(conv, rows) {
  const replies = FLATMATE[conv.flatmate?.kind];
  const row = replies && rows.find(({ item }) => item.kind === 'flatmate'
    && item.target?.id === conv.flatmate.id && item.party?.id === conv.party?.id);
  return row ? replies[row.box === 'sent' ? 'asker' : 'poster'] : [];
}

/** Ready-made openers for this chat's case (listing contact, visit, offer, flatmate), from either side. */
export function quickReplies(conv, boxes, now = Date.now()) {
  if (!conv || conv.request || conv.group || conv.staged || conv.blocked || conv.blockedYou || conv.listingDeleted) return [];
  if ([boxes.sent, boxes.received].some((b) => b.status === 'loading' && !b.items.length)) return [];
  const messages = conv.messages || [];
  if (!yourOpening(messages)) return [];
  const rows = withBox(boxes);
  const replies = conv.propertyId ? listingReplies(conv, rows, now) : flatmateReplies(conv, rows);
  const said = messages.filter((m) => m.from === 'me').map((m) => String(m.text || '').toLowerCase());
  return replies.filter((text) => !said.some((s) => s.includes(text.toLowerCase())));
}
