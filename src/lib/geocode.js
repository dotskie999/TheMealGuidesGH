import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMarket, isWithinMarketArea, normalizeMarketCode } from '@/lib/markets';
import { geoapifyConfigured, geoapifyForward, geoapifyReverse } from '@/lib/geoapify';

const runtime = globalThis;
runtime.__tmgGeocodeQueue ||= Promise.resolve();
runtime.__tmgLastGeocodeAt ||= 0;

const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const cacheKey = (city, barangay, marketCode, houseNumber, landmark) => [marketCode,houseNumber,landmark,barangay,city].map(value=>normalize(value).toLowerCase()).join('|');

async function publicGeocode(city, barangay, marketCode, houseNumber, landmark) {
  if(geoapifyConfigured()){
    const market=getMarket(marketCode);
    const fullQuery=[houseNumber,landmark,barangay,city,market.region,market.country].filter(Boolean).join(', ');
    const areaQuery=[barangay,city,market.region,market.country].filter(Boolean).join(', ');
    for(const candidate of [{query:fullQuery,precision:'address'},...(fullQuery===areaQuery?[]:[{query:areaQuery,precision:'area'}])]){
      const match=(await geoapifyForward({text:candidate.query,marketCode,limit:1}))[0];
      if(match) return {latitude:match.latitude,longitude:match.longitude,display_name:match.formatted,precision:candidate.precision,provider:'geoapify'};
    }
    return null;
  }
  const task = runtime.__tmgGeocodeQueue.then(async () => {
    const market = getMarket(marketCode);
    const fullParts=[houseNumber,landmark,barangay,city,market.region,market.country].filter(Boolean);
    const areaParts=[barangay,city,market.region,market.country].filter(Boolean);
    const queries=[{query:fullParts.join(', '),precision:'address'},...(fullParts.join(', ')===areaParts.join(', ')?[]:[{query:areaParts.join(', '),precision:'area'}])];
    for(const candidate of queries){
      const wait = Math.max(0, 1100 - (Date.now() - runtime.__tmgLastGeocodeAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      runtime.__tmgLastGeocodeAt = Date.now();
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', candidate.query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', market.countryCode.toLowerCase());
      url.searchParams.set('addressdetails', '1');
      const response = await fetch(url, {cache:'no-store',headers:{Accept:'application/json','Accept-Language':'en','User-Agent':'TheMealGuides/1.0 (https://www.facebook.com/themealguides)'}});
      if (!response.ok) throw new Error('Address lookup is temporarily unavailable.');
      const results = await response.json();
      const match = Array.isArray(results) ? results[0] : null;
      if(!match) continue;
      const latitude=Number(match.lat); const longitude=Number(match.lon);
      if(Number.isFinite(latitude)&&Number.isFinite(longitude)) return {latitude,longitude,display_name:match.display_name||candidate.query,precision:candidate.precision};
    }
    return null;
  });
  runtime.__tmgGeocodeQueue = task.catch(() => {});
  return task;
}

export async function geocodeDeliveryArea(cityValue, barangayValue, marketValue = 'gh-greater-accra', houseNumberValue = '', landmarkValue = '') {
  const city = normalize(cityValue);
  const barangay = normalize(barangayValue);
  const houseNumber=normalize(houseNumberValue);
  const landmark=normalize(landmarkValue);
  const marketCode = normalizeMarketCode(marketValue);
  if (!city || !barangay || city.length > 100 || barangay.length > 100) {
    throw new Error('A valid municipality and area are required.');
  }

  const key = cacheKey(city, barangay, marketCode, houseNumber, landmark);
  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('location_cache')
    .select('latitude,longitude,display_name')
    .eq('cache_key', key)
    .maybeSingle();
  if (!cacheError && cached) return { ...cached, source: 'cache', precision:houseNumber?'estimated':'area' };

  const result = await publicGeocode(city, barangay, marketCode, houseNumber, landmark);
  if (!result) return null;

  await supabaseAdmin.from('location_cache').upsert({
    cache_key: key,
    city,
    barangay,
    latitude:result.latitude,
    longitude:result.longitude,
    display_name:result.display_name,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'cache_key' });
  return { ...result, source:result.provider==='geoapify'?'geoapify':'openstreetmap' };
}

export async function reverseGeocodeCoordinates(latitudeValue, longitudeValue, marketValue = 'gh-greater-accra') {
  const latitude=Number(latitudeValue); const longitude=Number(longitudeValue);
  if(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180) throw new Error('Invalid map coordinates.');
  const marketCode=normalizeMarketCode(marketValue);
  if(!isWithinMarketArea(marketCode,latitude,longitude)) throw new Error(`This delivery point is outside our current ${getMarket(marketCode).region} service area.`);
  if(geoapifyConfigured()){
    const result=await geoapifyReverse({latitude,longitude,marketCode});
    if(!result) throw new Error('No address was found for this map location.');
    // The provider's coordinates belong to its nearest mapped feature. Use
    // that feature only as the label and preserve the customer's exact pin.
    return {...result,latitude,longitude};
  }
  const task=runtime.__tmgGeocodeQueue.then(async()=>{
    const wait=Math.max(0,1100-(Date.now()-runtime.__tmgLastGeocodeAt));
    if(wait) await new Promise(resolve=>setTimeout(resolve,wait));
    runtime.__tmgLastGeocodeAt=Date.now();
    const url=new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat',String(latitude)); url.searchParams.set('lon',String(longitude));
    url.searchParams.set('format','jsonv2'); url.searchParams.set('addressdetails','1'); url.searchParams.set('zoom','18');
    const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json','Accept-Language':'en','User-Agent':'TheMealGuides/1.0 (https://www.facebook.com/themealguides)'}});
    if(!response.ok) throw new Error('Map address lookup is temporarily unavailable.');
    const result=await response.json(); const address=result?.address||{};
    const state=String(address.state||address.region||address.state_district||'').toLowerCase();
    if(state&&!state.includes('greater accra')) throw new Error('This delivery point is outside our current Greater Accra service area.');
    const city=address.city||address.town||address.municipality||address.county||'';
    const barangay=address.suburb||address.neighbourhood||address.quarter||address.village||address.hamlet||'';
    const road=address.road||address.pedestrian||address.residential||address.path||'';
    const houseNumber=[address.house_number,road].filter(Boolean).join(' ')||result?.name||road;
    return {latitude,longitude,city,barangay,house_number:houseNumber,formatted:result?.display_name||[barangay,city].filter(Boolean).join(', ')};
  });
  runtime.__tmgGeocodeQueue=task.catch(()=>{});
  return task;
}
