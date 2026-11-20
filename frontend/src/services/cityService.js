import { createProvider } from './config.js';

const provider = createProvider('city');

export const listCities = async () => (await provider()).listCities();

export const joinCityWaitlist = async (request) => (await provider()).joinCityWaitlist(request);

export const listCityWaitlist = async () => (await provider()).listCityWaitlist();

