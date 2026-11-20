import { createProvider } from './config.js';

const provider = createProvider('serviceRequest');

export const listServiceRequests = async (typeFilter, opts) => (await provider()).listServiceRequests(typeFilter, opts);

export const getServiceRequest = async (id) => (await provider()).getServiceRequest(id);

export const listServiceRequestQueue = async (opts) => (await provider()).listServiceRequestQueue(opts);

export const getServiceRequestQueueSummary = async (team) => (await provider()).getServiceRequestQueueSummary(team);

export const takeServiceRequest = async (id) => (await provider()).takeServiceRequest(id);

export const shareServiceRequestDraft = async (id, payload) =>
  (await provider()).shareServiceRequestDraft(id, payload);

export const uploadServiceRequestFinalDoc = async (id, file, registration) =>
  (await provider()).uploadServiceRequestFinalDoc(id, file, registration);

export const cancelServiceRequestAsOps = async (id, reason) =>
  (await provider()).cancelServiceRequestAsOps(id, reason);

export const readServiceRequestIdentities = async (id) => (await provider()).readServiceRequestIdentities(id);

export const readServiceRequestChecklist = async (id) => (await provider()).readServiceRequestChecklist(id);

export const reviewServiceRequestDocument = async (id, category, review) =>
  (await provider()).reviewServiceRequestDocument(id, category, review);

export const getServiceRequestDocumentUrl = async (id, docId) =>
  (await provider()).getServiceRequestDocumentUrl(id, docId);

export const listServiceRequestRentAgreements = async (id) =>
  (await provider()).listServiceRequestRentAgreements(id);

export const listServiceRequestOverlaps = async (id) =>
  (await provider()).listServiceRequestOverlaps(id);

export const proposeServiceRequestAmendment = async (id, amendment) =>
  (await provider()).proposeServiceRequestAmendment(id, amendment);

export const acceptServiceRequestAmendment = async (id, amendmentId) =>
  (await provider()).acceptServiceRequestAmendment(id, amendmentId);

export const withdrawServiceRequestAmendment = async (id, amendmentId) =>
  (await provider()).withdrawServiceRequestAmendment(id, amendmentId);

export const askServiceRequestAttention = async (id, ask) =>
  (await provider()).askServiceRequestAttention(id, ask);

export const resolveServiceRequestAttention = async (id, note) =>
  (await provider()).resolveServiceRequestAttention(id, note);

export const editServiceRequestDetails = async (id, state, note) =>
  (await provider()).editServiceRequestDetails(id, state, note);
export const correctServiceRequestIdentities = async (id, parties) =>
  (await provider()).correctServiceRequestIdentities(id, parties);

export const getServiceRequestRefunds = async (id) => (await provider()).getServiceRequestRefunds(id);

export const requestServiceRequestRefund = async (id, refund) =>
  (await provider()).requestServiceRequestRefund(id, refund);

export const decideServiceRequestRefund = async (id, refundId, decision, note) =>
  (await provider()).decideServiceRequestRefund(id, refundId, decision, note);

export const verifyRentAgreement = async (agreementId, status) =>
  (await provider()).verifyRentAgreement(agreementId, status);

export const createServiceRequest = async (data) => (await provider()).createServiceRequest(data);

export const createCoFillServiceRequest = async ({ request, role, mobile }) =>
  (await provider()).createCoFillServiceRequest({ request, role, mobile });

export const listMyServiceRequestInvites = async (opts) =>
  (await provider()).listMyServiceRequestInvites(opts);

export const decideServiceRequestInvite = async (partyId, decision) =>
  (await provider()).decideServiceRequestInvite(partyId, decision);

export const submitServiceRequestPartyDetails = async (id, details) =>
  (await provider()).submitServiceRequestPartyDetails(id, details);

export const updateServiceRequestDetails = async (id, details) =>
  (await provider()).updateServiceRequestDetails(id, details);

export const openServiceRequestCheckout = async (id, declaration) =>
  (await provider()).openServiceRequestCheckout(id, declaration);
export const simulateServiceRequestPayment = async (id, outcome) =>
  (await provider()).simulateServiceRequestPayment(id, outcome);
export const cancelServiceRequest = async (id) =>
  (await provider()).cancelServiceRequest(id);
export const deleteServiceRequest = async (id) =>
  (await provider()).deleteServiceRequest(id);

export const withdrawServiceRequestParty = async (id, partyId) =>
  (await provider()).withdrawServiceRequestParty(id, partyId);

export const inviteServiceRequestParty = async (id, { role, mobile, partyIndex }) =>
  (await provider()).inviteServiceRequestParty(id, { role, mobile, partyIndex });

export const addServiceRequestDoc = async (id, doc) =>
  (await provider()).addServiceRequestDoc(id, doc);

export const addServiceRequestDocFromVault = async (id, { documentId, category }) =>
  (await provider()).addServiceRequestDocFromVault(id, { documentId, category });

export const recordServiceRequestIdentities = async (id, parties) =>
  (await provider()).recordServiceRequestIdentities(id, parties);

export const readMaskedServiceRequestIdentities = async (id) =>
  (await provider()).readMaskedServiceRequestIdentities(id);

export const decideServiceRequestDraft = async (id, decision, note) =>
  (await provider()).decideServiceRequestDraft(id, decision, note);

export const approveServiceRequestDraftParty = async (id, partyKey, otp) =>
  (await provider()).approveServiceRequestDraftParty(id, partyKey, otp);

export const markServiceRequestRead = async (id) => (await provider()).markServiceRequestRead(id);

export const markServiceRequestDraftOpened = async (id) =>
  (await provider()).markServiceRequestDraftOpened(id);
