import 'server-only';
import { getMarket } from '@/lib/markets';

const endpoint='https://api.geoapify.com/v1/geocode';
const apiKey=()=>String(process.env.GEOAPIFY_API_KEY||'').trim();
export const geoapifyConfigured=()=>Boolean(apiKey());

function addressResult(result={}) {
  const city=result.city||result.municipality||result.county||'';
  const barangay=result.suburb||result.district||result.city_district||result.quarter||result.village||'';
  const houseNumber=[result.housenumber,result.street].filter(Boolean).join(' ')||result.address_line1||result.name||result.street||'';
  return {latitude:Number(result.lat),longitude:Number(result.lon),city,barangay,house_number:houseNumber,formatted:result.formatted||[houseNumber,barangay,city].filter(Boolean).join(', '),state:result.state||result.state_district||'',result_type:result.result_type||'',confidence:Number(result.rank?.confidence??0),place_id:result.place_id||null,source:'geoapify'};
}

function insideGreaterAccra(result={}) {
  const state=String(result.state||'').toLowerCase();
  if(state) return state.includes('greater accra');
  return result.latitude>=5.3&&result.latitude<=6.2&&result.longitude>=-0.7&&result.longitude<=0.5;
}

function insideMarket(result,marketCode) {
  return getMarket(marketCode).code!=='gh-greater-accra'||insideGreaterAccra(result);
}

async function request(path,params) {
  if(!geoapifyConfigured()) return null;
  const url=new URL(`${endpoint}/${path}`);
  Object.entries({...params,format:'json',apiKey:apiKey()}).forEach(([key,value])=>{if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));});
  const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error(response.status===429?'Address search limit reached. Please try again shortly.':'Geoapify address lookup is temporarily unavailable.');
  return response.json();
}

export async function geoapifyForward({text,marketCode,limit=1,bias}) {
  const market=getMarket(marketCode); const payload=await request('search',{text,limit,lang:'en',filter:`countrycode:${market.countryCode.toLowerCase()}`,bias});
  return (payload?.results||[]).map(addressResult).filter(result=>Number.isFinite(result.latitude)&&Number.isFinite(result.longitude)&&insideMarket(result,marketCode));
}

export async function geoapifyAutocomplete({text,marketCode,limit=6,bias}) {
  const market=getMarket(marketCode); const payload=await request('autocomplete',{text,limit,lang:'en',filter:`countrycode:${market.countryCode.toLowerCase()}`,bias});
  return (payload?.results||[]).map(addressResult).filter(result=>Number.isFinite(result.latitude)&&Number.isFinite(result.longitude)&&insideMarket(result,marketCode));
}

export async function geoapifyReverse({latitude,longitude,marketCode}) {
  const market=getMarket(marketCode); const payload=await request('reverse',{lat:latitude,lon:longitude,limit:1,lang:'en',countrycodes:market.countryCode.toLowerCase()});
  const result=payload?.results?.[0];
  if(!result) return null;
  const address=addressResult(result);
  if(!insideMarket(address,marketCode)) throw new Error('This delivery point is outside our current Greater Accra service area.');
  return address;
}
