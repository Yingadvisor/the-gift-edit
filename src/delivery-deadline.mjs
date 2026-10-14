/** Strict delivery screening. Current integration has no verified destination-bound
 * arrival estimate in its search/product contract. Never parse marketing prose,
 * stock, ships_to, shipping speed, or an arbitrary field as an arrival promise.
 * Dates remain local. Do not create a checkout merely to obtain an estimate.
 */
export function validArrivalDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
}
export function assessArrival(product,variant,profile={}) {
  if(!profile.arrivalDeadline)return {eligible:true,status:'not-requested',reason:'No strict arrival deadline selected.'};
  return {eligible:false,status:'unverified',reason:`Can’t verify delivery by ${profile.arrivalDeadline}. Current Shop catalog data does not provide a supported destination-specific arrival commitment. Stock is not delivery confirmation.`};
}
