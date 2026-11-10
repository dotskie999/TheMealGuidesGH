export function restaurantSlug(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function restaurantCity(restaurant = {}) {
  if (restaurant.city) return String(restaurant.city).trim();
  const address = String(restaurant.address || '');
  const parts=address.split(',').map((part)=>part.trim()).filter(Boolean);
  return parts.length>1 ? parts[parts.length-2] : parts[0] || '';
}
