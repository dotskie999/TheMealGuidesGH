import { canonicalDeploymentMarket, DEFAULT_DEPLOYMENT_MARKET, isDeploymentMarket } from '@/lib/deployment';

export const DEFAULT_MARKET = DEFAULT_DEPLOYMENT_MARKET;

export const MARKETS = {
  'gh-greater-accra': {
    code: 'gh-greater-accra', countryCode: 'GH', country: 'Ghana', region: 'Greater Accra',
    label: 'Greater Accra, Ghana', currency: 'GHS', locale: 'en-GH', phonePrefix: '+233',
    cityLabel: 'Municipal assembly', areaLabel: 'Area / Suburb', digitalAddress: true,
  },
};

export const ALL_MARKET_OPTIONS = Object.values(MARKETS);
export const MARKET_OPTIONS = ALL_MARKET_OPTIONS;
export const getMarket = (code) => MARKETS[canonicalDeploymentMarket(code)] || MARKETS[DEFAULT_MARKET];
export const normalizeMarketCode = (code) => {
  const canonical=canonicalDeploymentMarket(code);
  return MARKETS[canonical]&&isDeploymentMarket(canonical)?canonical:DEFAULT_MARKET;
};

const inside = (latitude, longitude, bounds) => latitude >= bounds.south && latitude <= bounds.north && longitude >= bounds.west && longitude <= bounds.east;

export function isWithinMarketArea(marketCode, latitudeValue, longitudeValue) {
  const latitude=Number(latitudeValue); const longitude=Number(longitudeValue);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)) return false;
  const code=getMarket(marketCode).code;
  if(code==='gh-greater-accra') return inside(latitude,longitude,{south:5.3,north:6.2,west:-0.7,east:0.5});
  return false;
}

export function detectMarketFromCoordinates(latitudeValue, longitudeValue) {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { supported:false, countryCode:null, marketCode:null };

  const ghana = inside(latitude, longitude, { south:4.5, north:11.3, west:-3.5, east:1.5 });
  if (ghana) {
    const launchArea = inside(latitude, longitude, { south:5.35, north:6.05, west:-0.7, east:0.45 });
    if (!launchArea) return { supported:false, countryCode:'GH', marketCode:null };
    return { supported:true, countryCode:'GH', marketCode:'gh-greater-accra' };
  }

  return { supported:false, countryCode:null, marketCode:null };
}

export const marketMoney = (value, code = DEFAULT_MARKET) => {
  const market = getMarket(code);
  return new Intl.NumberFormat(market.locale, { style:'currency', currency:market.currency }).format(Number(value || 0));
};

export const GHANA_LOCATIONS = {
  'gh-greater-accra': [
    ['accra-metropolitan','Accra Metropolitan Assembly (AMA)',['Jamestown','Ussher Town','Makola','Agbogbloshie','Korle Bu','Chorkor','Mamprobi','Korle Gonno','Palladium']],
    ['korle-klottey','Korle Klottey Municipal Assembly',['Osu','Adabraka','Asylum Down','North Ridge','West Ridge','Ministries','Tudu','Odawna']],
    ['la-dade-kotopon','La Dade Kotopon Municipal Assembly (LaDMA)',['La (Labadi)','Cantonments','Labone','Airport Residential Area','Airport Hills','Tse Addo','Burma Camp','South La']],
    ['ayawaso-west','Ayawaso West Municipal Assembly',['East Legon','Dzorwulu','Roman Ridge','Abelemkpe','Westland (West Legon)','Mempeasem','Shiashie']],
    ['ayawaso-central','Ayawaso Central Municipal Assembly',['Alajo','Kotobabi','Accra New Town','Kokomlemle','Pig Farm','Caprice']],
    ['ayawaso-east','Ayawaso East Municipal Assembly',['Nima','Kanda']],
    ['ayawaso-north','Ayawaso North Municipal Assembly',['Maamobi','Accra Girls area']],
    ['ablekuma-west','Ablekuma West Municipal Assembly',['Dansoman','Sahara','Gbegbeyise','Agege','Mpoase','Shiabu']],
    ['ablekuma-central','Ablekuma Central Municipal Assembly',['Lartebiokorshie','Mataheko','Abossey Okai','Sukura','Russia','Sabon Zongo']],
    ['ablekuma-north','Ablekuma North Municipal Assembly',['Darkuman','Kwashieman','Odorkor','Awoshie','Sakaman','Nyamekye']],
    ['okaikwei-south','Okaikwei South Municipal Assembly',['Kaneshie','North Kaneshie','Bubuashie','Avenor','Awudome']],
    ['okaikwei-north','Okaikwei North Municipal Assembly',['Achimota','Lapaz','Akweteyman','Abeka','New Fadama','Kisseman','Christian Village']],
    ['la-nkwantanang-madina','La Nkwantanang Madina Municipal Assembly',['Madina','Oyarifa','Ayi Mensah','Danfa','Pantang','Teiman']],
    ['adentan','Adentan Municipal Assembly',['Adenta','Ashaley Botwe','Frafraha','Ogbojo','Amrahia','Nmai Dzorn']],
    ['ga-east','Ga East Municipal Assembly',['Abokobi','Dome','Kwabenya','Taifa','Haatso','Ashongman Estate','Agbogba']],
    ['ga-west','Ga West Municipal Assembly',['Amasaman','Pokuase','Medie','Sarpeiman','Fise']],
    ['ga-north','Ga North Municipal Assembly',['Ofankor','Mile 7','Tantra Hill','John Teye','Trotro']],
    ['ga-central','Ga Central Municipal Assembly',['Sowutuom','Santa Maria','Anyaa','Chantan','Tabora','Lomnava']],
    ['ga-south','Ga South Municipal Assembly',['Weija','Gbawe','McCarthy Hill','Mallam','Bortianor','Kokrobite','Kasoa Toll Booth Area']],
    ['ledzokuku','Ledzokuku Municipal Assembly (LeKMA)',['Teshie','Teshie Nungua Estates (shared)','Tsuibleoo','Agblezaa','Teshie Camp']],
    ['krowor','Krowor Municipal Assembly (KroMA)',['Nungua','Greda Estate','Buade','Sakumono Estate (border area)']],
    ['tema-west','Tema West Municipal Assembly',['Sakumono','Lashibi','Baatsona (Spintex Road)','Klagon','Adjei Kojo','Borteyman','Community 13','Community 14','Community 15','Community 16','Community 17','Community 18','Community 19','Community 20']],
    ['tema-metropolitan','Tema Metropolitan Assembly (TMA)',['Community 1','Community 2','Community 3','Community 4','Community 5','Community 6','Community 7','Community 8','Community 9','Community 10','Community 11','Community 12','Tema Manhean (Tema Newtown)','Bankuman','Heavy Industrial Area','Light Industrial Area']],
    ['ashaiman','Ashaiman Municipal Assembly',['Ashaiman Zongo','Lebanon','Official Town','Taifa (Ashaiman)','Valco Flats','Jericho','Night Market area']],
    ['kpone-katamanso','Kpone Katamanso Municipal Assembly',['Kpone','Dawhenya','Michel Camp','Gbetsile','Appolonia','Sebrepor','Bediako','Golf City']],
  ],
};
