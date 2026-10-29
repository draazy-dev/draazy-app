import { get, put } from '../../http.js';

export const getFunctionCatalogue = () => get('/admin/function-catalogue');

export const getMemberPermissions = (userId) => get(`/users/${userId}/permissions`);

export const saveMemberFunctions = (userId, functions) =>
  put(`/users/${userId}/permissions`, { functions });
