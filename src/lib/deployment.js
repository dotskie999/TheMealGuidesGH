const LEGACY_MARKET_ALIASES = {
  'gh-accra':'gh-greater-accra',
  'gh-tema':'gh-greater-accra',
};

export function normalizeDeploymentCountry(value) {
  return 'GH';
}

export const DEPLOYMENT_COUNTRY = 'GH';
export const DEPLOYMENT_MARKET_CODES = ['gh-greater-accra'];
export const DEFAULT_DEPLOYMENT_MARKET = 'gh-greater-accra';
export const DEPLOYMENT_TIMEZONE = 'Africa/Accra';
export const DEPLOYMENT_COUNTRY_NAME = 'Ghana';

export function canonicalDeploymentMarket(code) {
  const normalized=String(code||'').trim().toLowerCase();
  return LEGACY_MARKET_ALIASES[normalized]||normalized;
}

export function isDeploymentMarket(code) {
  return DEPLOYMENT_MARKET_CODES.includes(canonicalDeploymentMarket(code));
}
