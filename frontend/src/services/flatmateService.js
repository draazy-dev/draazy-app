import { createProvider } from './config.js';

const provider = createProvider('flatmate');

export { CONFLICT_ALREADY_INTERESTED, CONFLICT_GROUP_FULL } from './providers/http/flatmateMapper.js';

export const createRoom = async (room) => (await provider()).createRoom(room);
export const updateRoom = async (id, room) => (await provider()).updateRoom(id, room);
export const setRoomSeats = async (id, seatsOpen) => (await provider()).setRoomSeats(id, seatsOpen);
export const setRoomOccupants = async (id, occupants) => (await provider()).setRoomOccupants(id, occupants);
export const requestRoomBadge = async (id, body) => (await provider()).requestRoomBadge(id, body);
export const requestGroupBadge = async (id, body) => (await provider()).requestGroupBadge(id, body);
export const roomInterest = async (id, body) => (await provider()).roomInterest(id, body);

export const createGroup = async (group) => (await provider()).createGroup(group);
export const updateGroup = async (id, group) => (await provider()).updateGroup(id, group);
export const getFlatmateDetail = async (kind, id) => (await provider()).getFlatmateDetail(kind, id);
export const deleteGroup = async (id) => (await provider()).deleteGroup(id);
export const deleteRoom = async (id) => (await provider()).deleteRoom(id);
export const renewFlatmate = async (kind, id) => (await provider()).renewFlatmate(kind, id);
export const setGroupSeats = async (id, seatsOpen) => (await provider()).setGroupSeats(id, seatsOpen);

export const joinGroup = async (id, body) => (await provider()).joinGroup(id, body);
export const leaveGroup = async (id) => (await provider()).leaveGroup(id);
export const removeGroupMember = async (id, memberId) => (await provider()).removeGroupMember(id, memberId);
export const withdrawInterest = async (kind, id) => (await provider()).withdrawInterest(kind, id);

export const requestOwnerConsent = async (body) => (await provider()).requestOwnerConsent(body);
export const getOwnerNotice = async (token) => (await provider()).getOwnerNotice(token);
export const answerOwnerNotice = async (token, answer) => (await provider()).answerOwnerNotice(token, answer);
export const getOwnerHomes = async () => (await provider()).getOwnerHomes();
export const getOwnerHomePrefill = async (managedId) => (await provider()).getOwnerHomePrefill(managedId);

export const createPost = async (body) => (await provider()).createPost(body);
export const updatePost = async (id, patch) => (await provider()).updatePost(id, patch);
export const deletePost = async (id) => (await provider()).deletePost(id);
export const postInterest = async (id, body) => (await provider()).postInterest(id, body);

export const myRequests = async (status) => (await provider()).myRequests(status);
export const myFlatmateInterests = async () => (await provider()).myFlatmateInterests();
export const myFlatmateInterestKeys = async (opts) => (await provider()).myFlatmateInterestKeys(opts);
export const decideRequest = async (id, decision) => (await provider()).decideRequest(id, decision);

export const splitProperty = async (propertyId, body) => (await provider()).splitProperty(propertyId, body);
export const unsplitProperty = async (propertyId) => (await provider()).unsplitProperty(propertyId);

export const feed = async (tab, filters, page, size, opts) => (await provider()).feed(tab, filters, page, size, opts);
export const flatmatePulse = async () => (await provider()).flatmatePulse();

export const listFlatmateSaves = async (params) => (await provider()).listFlatmateSaves(params);
export const listFlatmateSaveKeys = async (opts) => (await provider()).listFlatmateSaveKeys(opts);
export const saveFlatmatePost = async (kind, id) => (await provider()).saveFlatmatePost(kind, id);
export const unsaveFlatmatePost = async (kind, id) => (await provider()).unsaveFlatmatePost(kind, id);

export const listFlatmateReviews = async (params) => (await provider()).listFlatmateReviews(params);
export const decideFlatmateReview = async (id, decision, note, checks) => (await provider()).decideFlatmateReview(id, decision, note, checks);
export const getFlatmateReviewDocumentUrl = async (id) => (await provider()).getFlatmateReviewDocumentUrl(id);
export const revokeFlatmateReview = async (id, reason) => (await provider()).revokeFlatmateReview(id, reason);

export const listFlatmateModeration = async (params) => (await provider()).listFlatmateModeration(params);
export const getFlatmateModerationSummary = async () => (await provider()).getFlatmateModerationSummary();
export const getFlatmateModerationDetail = async (id) => (await provider()).getFlatmateModerationDetail(id);
export const editFlatmateAsModerator = async (id, changes) => (await provider()).editFlatmateAsModerator(id, changes);
export const moderateFlatmatePost = async (id, modStatus, note, reasonCode) => (await provider()).moderateFlatmatePost(id, modStatus, note, reasonCode);
export const tickFlatmateChecklist = async (id, item, pass) => (await provider()).tickFlatmateChecklist(id, item, pass);

export const getFlatmateCase = async (kind, id) => (await provider()).getFlatmateCase(kind, id);
export const replyToFlatmateCase = async (kind, id, body) => (await provider()).replyToFlatmateCase(kind, id, body);
export const markFlatmateCaseRead = async (kind, id) => (await provider()).markFlatmateCaseRead(kind, id);
export const listMyFlatmateCases = async () => (await provider()).listMyFlatmateCases();

export const listGroupApplications = async (params) => (await provider()).listGroupApplications(params);
export const moderateGroupApplication = async (id, modStatus, note) => (await provider()).moderateGroupApplication(id, modStatus, note);

export const myFlatmateGroups = async (params) => (await provider()).myFlatmateGroups(params);
export const myFlatmateRooms = async (params) => (await provider()).myFlatmateRooms(params);
export const myFlatmatePosts = async (params) => (await provider()).myFlatmatePosts(params);
export const getMyFlatmatePost = async (id) => (await provider()).getMyFlatmatePost(id);
export const applyGroupToListing = async (groupId, listingId) => (await provider()).applyGroupToListing(groupId, listingId);
export const listMyGroupApplications = async (params) => (await provider()).listMyGroupApplications(params);
export const decideGroupApplication = async (id, status) => (await provider()).decideGroupApplication(id, status);

export const myLivingStyle = async () => (await provider()).myLivingStyle();
export const saveMyLivingStyle = async (answers) => (await provider()).saveMyLivingStyle(answers);
export const livingStyleOf = async (kind, id) => (await provider()).livingStyleOf(kind, id);
