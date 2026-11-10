import 'server-only';

export function serverDeploymentCountry() {
  return 'GH';
}

export function serverMarketCodes() {
  return ['gh-greater-accra','gh-accra','gh-tema'];
}

export function serverDefaultMarket() {
  return 'gh-greater-accra';
}

export function isServerMarket(code) {
  return serverMarketCodes().includes(String(code || '').trim().toLowerCase());
}

export function assertServerMarket(code) {
  const normalized=String(code || '').trim().toLowerCase();
  if(!isServerMarket(normalized)) throw new Error('This Ghana deployment cannot access the selected market.');
  return ['gh-accra','gh-tema'].includes(normalized)?'gh-greater-accra':normalized;
}
