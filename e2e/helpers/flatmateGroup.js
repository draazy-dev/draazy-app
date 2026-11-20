/** A group body for the API: hunting groups carry `preferences`, a group that already has a flat is refused. */
export function huntingGroup({ locality = 'Baner', rent = 30000, deposit, role, agreement, agreementDoc, ...rest } = {}) {
  return {
    ...rest,
    preferences: rest.preferences ?? {
      localities: [locality],
      rentMax: rent,
      depositMax: deposit ?? rent * 3,
      gatedOnly: false,
      bachelors: false,
    },
  };
}
