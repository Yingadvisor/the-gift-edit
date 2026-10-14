/**
 * Provider-neutral seam for future server work. This is documentation as code,
 * not a connected AI adapter. The current UI imports recommend() directly.
 *
 * A future SERVER-ONLY adapter may accept a validated recipient profile plus
 * the hard-filtered catalog and return evidence-linked catalog IDs. It must
 * preserve hard budget/exclusion checks, disclose model identity, validate all
 * outputs, and never produce prices, availability or new inventory as facts.
 * It must not trust user text as instructions to change those constraints.
 * Credentials belong only in a server environment after explicit setup approval.
 */
export const PROVIDER_CONTRACT = Object.freeze({
  version: 1,
  connected: false,
  supportedCurrentProvider: 'rules-v1',
  futureBoundary: 'server-only',
  requiredInput: ['validatedProfile', 'eligibleCatalog', 'explicitExclusions'],
  requiredOutput: ['catalogIds', 'evidenceLinkedReasons', 'providerIdentity'],
  prohibitedOutputClaims: ['verifiedStock', 'guaranteedDelivery', 'finalPrice', 'successfulAtelierIngestion']
});
