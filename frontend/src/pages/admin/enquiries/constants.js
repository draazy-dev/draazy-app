const ENQUIRY_STATUS_OPTS = [['', 'All'], ['pending', 'Awaiting owner'], ['approved', 'Approved'], ['declined', 'Declined']];
const VISIT_STATUS_OPTS = [['', 'All'], ['scheduled', 'Scheduled'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['no-show', 'No show']];
const DEAL_STATUS_OPTS = [['', 'All'], ['active', 'Active'], ['reserved', 'Reserved'], ['closed', 'Closed']];
const DEAL_TYPE_OPTS = [['', 'All'], ['rent', 'Rent'], ['buy', 'Buy']];

const AWAITING_STATUSES = ['pending'];

export { ENQUIRY_STATUS_OPTS, VISIT_STATUS_OPTS, DEAL_STATUS_OPTS, DEAL_TYPE_OPTS, AWAITING_STATUSES };
