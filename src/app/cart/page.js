'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, LockKeyhole, MapPin, MapPinned, ShoppingBag, Store, Trash2, Truck } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useGuest } from '@/context/GuestContext';
import { restaurantSlug } from '@/lib/restaurant';
import { getMarket, marketMoney, normalizeMarketCode } from '@/lib/markets';
import LocationPinModal, { preloadLocationMap } from '@/components/LocationPinModal';
import { DEFAULT_DEPLOYMENT_MARKET, DEPLOYMENT_COUNTRY } from '@/lib/deployment';

const initialMarket=getMarket(DEFAULT_DEPLOYMENT_MARKET);
const initialForm = { market_code:DEFAULT_DEPLOYMENT_MARKET, country_code:DEPLOYMENT_COUNTRY, fulfillment_type:'doorstep', customer_name:'', customer_email:'', contact_number:initialMarket.phonePrefix, city:'', city_code:'', barangay:'', house_number:'', formatted_address:'', landmark:'', digital_address:'', order_remarks:'', latitude:null, longitude:null, location_accuracy:null, location_source:null, location_precision:null };

function MotorcycleIcon(){return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M8 17h5l2.5-4H18l1 1M8 17l-2-5H3M9 12h4l2 2M13 10l-1-2h3M10 17l3-5"/></svg>}

export default function CartPage() {
  const { items, ready, subtotal, removeItem, clearCart, saveOrder } = useCart();
  const { guest } = useGuest();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [deliveryQuote,setDeliveryQuote]=useState(null);
  const [quoteLoading,setQuoteLoading]=useState(false);
  const [mapOpen,setMapOpen]=useState(false);
  const router = useRouter();
  const marketCode=normalizeMarketCode(form.market_code||guest?.market_code);
  const market=getMarket(marketCode);
  const isGhana=market.countryCode==='GH';
  useEffect(()=>{
    const timer=window.setTimeout(()=>preloadLocationMap().catch(()=>{}),350);
    return()=>window.clearTimeout(timer);
  },[]);
  const money=(value)=>marketMoney(value,marketCode);
  const update = (event) => setForm((current) => ({
    ...current,
    [event.target.name]: event.target.value,
    ...(['barangay','house_number'].includes(event.target.name) ? { latitude:null, longitude:null, location_source:null, location_precision:null } : {}),
  }));

  useEffect(() => {
    if(market.countryCode==='GH'){
      setCities([]); setBarangays([]); setLocationsLoading(false); setLocationError('');
      return;
    }
    const controller = new AbortController();
    async function loadCities() {
      setLocationError('');
      try {
        const response = await fetch(`/api/locations?market=${encodeURIComponent(marketCode)}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load delivery locations.');
        if (!Array.isArray(result)) throw new Error('The location service returned invalid data.');
        setCities(result);
      } catch (err) {
        if (err.name !== 'AbortError') setLocationError(err.message);
      } finally {
        if (!controller.signal.aborted) setLocationsLoading(false);
      }
    }
    loadCities();
    return () => controller.abort();
  }, [marketCode,market.countryCode]);
  useEffect(() => {
    if (!guest) return;
    const guestMarket=getMarket(normalizeMarketCode(guest.market_code));
    const hasGhanaPin=guestMarket.countryCode!=='GH'||guest.location_source==='map_pin';
    setForm((current) => ({
      ...current,
      customer_name: guest.customer_name || '',
      market_code: normalizeMarketCode(guest.market_code),
      country_code: DEPLOYMENT_COUNTRY,
      customer_email: guest.customer_email || '',
      contact_number: guest.contact_number || initialMarket.phonePrefix,
      city: guest.city || '',
      city_code: guest.city_code || '',
      barangay: guest.barangay || '',
      house_number: guest.house_number || '',
      formatted_address: hasGhanaPin?(guest.formatted_address || [guest.house_number, guest.barangay, guest.city].filter(Boolean).join(', ')):'',
      landmark: guest.landmark || '',
      digital_address: guest.digital_address || '',
      latitude: guest.latitude ?? null,
      longitude: guest.longitude ?? null,
      location_accuracy: guest.location_accuracy ?? null,
      location_source: guest.location_source || null,
      location_precision: null,
    }));
    if (guest.city_code) {
      fetch(`/api/locations?market=${encodeURIComponent(normalizeMarketCode(guest.market_code))}&city=${encodeURIComponent(guest.city_code)}`)
        .then((response) => response.json())
        .then((rows) => { if (Array.isArray(rows)) setBarangays(rows); })
        .catch(() => {});
    }
  }, [guest]);
  useEffect(() => {
    if(!items.length) return;
    const controller=new AbortController();
    async function quote(){
      setQuoteLoading(true);
      setDeliveryQuote(null);
      try{
        let latitude=form.latitude; let longitude=form.longitude;
        let addressPrecision=form.location_precision;
        if(form.fulfillment_type==='doorstep'&&marketCode==='ph-ncr'&&!['address','map_pin'].includes(form.location_source)&&form.city&&form.barangay&&form.house_number){
          const geocodeResponse=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:form.city,barangay:form.barangay,house_number:form.house_number,landmark:form.landmark,market_code:marketCode}),signal:controller.signal});
          const geocodeResult=await geocodeResponse.json();
          if(!geocodeResponse.ok||!geocodeResult.location) throw new Error(geocodeResult.error||'We could not locate this delivery address.');
          latitude=geocodeResult.location.latitude;longitude=geocodeResult.location.longitude;addressPrecision=geocodeResult.location.precision;
          setForm(current=>({...current,latitude,longitude,location_accuracy:null,location_source:'address',location_precision:addressPrecision}));
        }
        const response=await fetch('/api/delivery-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({restaurant_id:items[0].restaurant_id,market_code:marketCode,fulfillment_type:form.fulfillment_type,latitude,longitude}),signal:controller.signal});
        const result=await response.json();
        if(!response.ok) throw new Error(result.error||'Delivery quote unavailable.');
        if(result.delivery_fee===null||result.delivery_fee===undefined) throw new Error(result.error||'We could not calculate the delivery distance.');
        setDeliveryQuote({...result,address_precision:addressPrecision});
      }catch(error){if(error.name!=='AbortError')setDeliveryQuote({delivery_fee:null,error:error.message});}
      finally{if(!controller.signal.aborted)setQuoteLoading(false);}
    }
    const timer=setTimeout(quote,650); return()=>{clearTimeout(timer);controller.abort();};
  },[form.fulfillment_type,form.latitude,form.longitude,form.location_source,form.location_precision,form.city,form.barangay,form.house_number,form.landmark,items,marketCode]);
  const chooseCity = async (event) => {
    const city_code = event.target.value;
    const city = cities.find(entry => entry.code === city_code)?.name || '';
    setForm(current => ({ ...current, city_code, city, barangay: '', latitude:null, longitude:null, location_source:null, location_precision:null }));
    setBarangays([]); setLocationsLoading(true); setLocationError('');
    try {
      const response = await fetch(`/api/locations?market=${encodeURIComponent(marketCode)}&city=${encodeURIComponent(city_code)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load barangays.');
      if (!Array.isArray(result)) throw new Error('The location service returned invalid data.');
      setBarangays(result);
    } catch (err) {
      setLocationError(err.message);
    } finally { setLocationsLoading(false); }
  };

  const applyPinnedLocation=async(location)=>{
    if(!location) throw new Error('Select a location on the map first.');
    if(market.countryCode==='GH'){
      const formatted=String(location.formatted||'').trim();
      if(!formatted) throw new Error('Choose a pin that has a recognizable delivery address.');
      const nextCity=location.city||market.region;
      const nextBarangay=location.barangay||location.city||'Pinned location';
      setForm(current=>({...current,city_code:'',city:nextCity,barangay:nextBarangay,house_number:location.house_number||formatted,formatted_address:formatted,latitude:Number(location.latitude),longitude:Number(location.longitude),location_accuracy:null,location_source:'map_pin',location_precision:'pin',digital_address:''}));
      setLocationError('');
      return;
    }
    const clean=(value)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(city of|city|municipality of|municipality|barangay|brgy)\b/g,'').replace(/[^a-z0-9]/g,'');
    const returnedCity=clean(location.city);
    const matchedCity=returnedCity?cities.find(entry=>{const candidate=clean(entry.name);return candidate===returnedCity||candidate.includes(returnedCity)||returnedCity.includes(candidate);}):null;
    let nextCityCode=form.city_code; let nextCity=form.city; let nextBarangay=form.barangay;
    if(matchedCity){
      nextCityCode=matchedCity.code; nextCity=matchedCity.name;
      const response=await fetch(`/api/locations?market=${encodeURIComponent(marketCode)}&city=${encodeURIComponent(matchedCity.code)}`);
      const rows=await response.json();
      if(response.ok&&Array.isArray(rows)){
        setBarangays(rows);
        const returnedArea=clean(location.barangay);
        const matchedArea=returnedArea?rows.find(entry=>{const candidate=clean(entry.name);return candidate===returnedArea||candidate.includes(returnedArea)||returnedArea.includes(candidate);}):null;
        if(matchedArea) nextBarangay=matchedArea.name;
      }
    } else if(returnedCity||!form.city_code) throw new Error('This pin is outside the currently supported delivery cities.');
    setForm(current=>({...current,city_code:nextCityCode,city:nextCity,barangay:nextBarangay,house_number:location.house_number||current.house_number,formatted_address:location.formatted||[location.house_number,nextBarangay,nextCity].filter(Boolean).join(', '),latitude:location.latitude,longitude:location.longitude,location_accuracy:null,location_source:'map_pin',location_precision:'pin'}));
  };

  const submit = async (event) => {
    event.preventDefault(); setError('');
    const requiresDeliveryQuote=form.fulfillment_type==='doorstep'&&marketCode==='ph-ncr';
    if(form.fulfillment_type==='doorstep'&&market.countryCode==='GH'&&(form.location_source!=='map_pin'||!Number.isFinite(Number(form.latitude))||!Number.isFinite(Number(form.longitude)))){setError('Confirm your exact delivery pin on the map.');return;}
    if(form.fulfillment_type==='doorstep'&&!form.formatted_address){setError('Choose and confirm the delivery address on the map.');return;}
    const validDeliveryQuote=deliveryQuote&&!deliveryQuote.error&&deliveryQuote.delivery_fee!==null&&deliveryQuote.delivery_fee!==undefined;
    if(requiresDeliveryQuote&&(quoteLoading||!validDeliveryQuote)){setError(deliveryQuote?.error||'Wait for a valid delivery fee before placing the order.');return;}
    const contact=form.contact_number.replace(/\s/g,'');
    const valid=market.countryCode==='GH'?/^\+233\d{9}$/.test(contact):/^\+63\d{10}$/.test(contact);
    if (!valid) { setError(`Use a valid ${market.country} number beginning with ${market.phonePrefix}.`); return; }
    setSubmitting(true);
    try {
      let checkoutForm = form;
      if (marketCode==='ph-ncr'&&form.fulfillment_type==='doorstep'&&!['address','map_pin'].includes(form.location_source) && form.city && form.barangay) {
        try {
          const locationResponse = await fetch('/api/geocode', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({city:form.city,barangay:form.barangay,house_number:form.house_number,landmark:form.landmark,market_code:marketCode}) });
          const locationResult = await locationResponse.json();
          if (locationResponse.ok && locationResult.location) checkoutForm = { ...form, latitude:locationResult.location.latitude, longitude:locationResult.location.longitude, location_accuracy:null, location_source:'address' };
          else throw new Error(locationResult.error||'We could not locate this delivery address.');
        } catch(geocodeError) { throw new Error(geocodeError.message||'We could not locate this delivery address.'); }
      }
      const { city_code, ...address } = checkoutForm;
      const payload = { restaurant_id: items[0].restaurant_id, items: items.map(({ cart_id, ...item }) => item), subtotal, ...address, market_code:marketCode, country_code:market.countryCode, contact_number:contact, fulfillment_type:form.fulfillment_type };
      const response = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.order_number) throw new Error(result.error || 'The kitchen could not place your order.');
      saveOrder({ ...payload, ...result, items, status: 'Pending payment' });
      clearCart(); router.push(`/receipt/${encodeURIComponent(result.order_number)}`);
    } catch (err) { setError(err.message); setSubmitting(false); }
  };

  if (!ready) return <main className="center-page"><Loader2 className="spin" /></main>;
  if (!items.length) return <main className="center-page"><div className="empty-cart"><span><ShoppingBag /></span><p className="kicker">Your cart</p><h1>Still deciding?</h1><p>Your next favorite meal is waiting.</p><Link href="/" className="primary-button">Browse kitchens</Link></div></main>;

  const menuUrl = items[0].restaurant_slug || (items[0].restaurant_name ? restaurantSlug(items[0].restaurant_name) : items[0].restaurant_id);
  const requiresDeliveryQuote=form.fulfillment_type==='doorstep'&&marketCode==='ph-ncr';
  const hasConfirmedDeliveryPin=market.countryCode!=='GH'||(form.location_source==='map_pin'&&Number.isFinite(Number(form.latitude))&&Number.isFinite(Number(form.longitude)));
  const quoteValid=deliveryQuote&&!deliveryQuote.error&&deliveryQuote.delivery_fee!==null&&deliveryQuote.delivery_fee!==undefined&&Number.isFinite(Number(deliveryQuote.delivery_fee));
  const previewDeliveryFee=quoteValid?Number(deliveryQuote.delivery_fee):null;
  const previewTotal=previewDeliveryFee===null&&requiresDeliveryQuote?null:subtotal+Number(previewDeliveryFee||0);
  return <main className="checkout-page"><header className="checkout-header"><Link href={`/restaurant/${menuUrl}`} className="back-link"><ArrowLeft size={19} /> Back to menu</Link><p className="kicker">Almost yours</p><h1>Review & checkout</h1><p>One last look before we send it to the kitchen.</p></header><div className="checkout-layout">
    <section className="cart-review"><div className="block-heading"><h2>Your order</h2><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></div><div className="fulfillment-choice" role="radiogroup" aria-label="Order fulfillment"><label className={form.fulfillment_type==='doorstep'?'selected':''}><input type="radio" name="fulfillment_type" value="doorstep" checked={form.fulfillment_type==='doorstep'} onChange={update}/>{isGhana?<MotorcycleIcon/>:<Truck/>}<span><strong>{isGhana?'Book my own ride':'Doorstep delivery'}</strong><small>{isGhana?'Arrange and pay your rider directly':'Fare based on driving distance'}</small></span></label><label className={form.fulfillment_type==='pickup'?'selected':''}><input type="radio" name="fulfillment_type" value="pickup" checked={form.fulfillment_type==='pickup'} onChange={update}/><Store/><span><strong>{isGhana?'Store Pickup':'Pickup'}</strong>{!isGhana&&<small>No delivery fee</small>}</span></label></div><div className="cart-items">{items.map((item) => <article className="cart-item" key={item.cart_id}><span className="quantity-badge">{item.quantity}×</span><div><h3>{item.name}</h3>{item.selected_options?.length > 0 && <p>{item.selected_options.map((option) => option.option_name).join(' · ')}</p>}{item.remarks && <em>“{item.remarks}”</em>}</div><div className="cart-item-end"><strong>{money(item.total_price)}</strong><button onClick={() => removeItem(item.cart_id)} aria-label={`Remove ${item.name}`}><Trash2 size={18} /></button></div></article>)}</div><div className="checkout-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Delivery fee</span><strong>{quoteLoading?'Calculating route…':deliveryQuote?.provider==='lalamove'?'Lalamove quote':quoteValid?money(previewDeliveryFee):'Unavailable'}</strong></div>{deliveryQuote?.error&&<small className="delivery-quote-error">{deliveryQuote.error} Review the address or select pickup.</small>}{Number.isFinite(deliveryQuote?.distance_km)&&<small>Estimated driving route: {Number(deliveryQuote.distance_km).toFixed(2)} km{Number.isFinite(deliveryQuote?.route_duration_minutes)?` · about ${deliveryQuote.route_duration_minutes} min`:''}.</small>}{['area','estimated'].includes(deliveryQuote?.address_precision)&&<small>Street-level coordinates were unavailable, so this uses the closest mapped area estimate.</small>}{deliveryQuote?.peak_surcharge>0&&<small>Includes {money(deliveryQuote.peak_surcharge)} peak surcharge.</small>}{deliveryQuote?.storm_surcharge>0&&<small>Includes {money(deliveryQuote.storm_surcharge)} storm surcharge for the rider.</small>}{deliveryQuote?.provider==='lalamove'&&<small>Beyond the internal fleet boundary. Lalamove fare will be arranged separately and is not included below.</small>}<div className="grand-total"><span>Total</span><strong>{previewTotal===null?'—':money(previewTotal)}</strong></div></div></section>
    <form className="checkout-form" onSubmit={submit}><div className="block-heading"><div><p className="kicker">Guest details</p><h2>Check your details</h2><p className="prefill-note">We filled these in from your {market.label} profile. Please check or change anything before ordering.</p></div><MapPin /></div><div className="form-grid"><label className="full"><span>Name</span><input name="customer_name" value={form.customer_name} onChange={update} placeholder="Customer name" required /></label><label className="full"><span>Email</span><input type="email" name="customer_email" value={form.customer_email} onChange={update} placeholder="you@example.com" required /></label><label className="full"><span>Contact number</span><input name="contact_number" value={form.contact_number} onChange={update} inputMode="tel" placeholder={market.phonePrefix} required /></label><button type="button" className="map-pin-button full" onClick={()=>setMapOpen(true)}><MapPinned/><span><strong>{form.formatted_address?'Edit delivery location':'Choose delivery location'}</strong><small>{market.countryCode==='GH'?'Use your GPS, search, or move the delivery pin':'Search your complete address or move the map pin'}</small></span>{form.location_source==='map_pin'&&<i><CheckCircle2/> Confirmed</i>}</button><div className="locked-address full"><MapPin/><span><small>Confirmed delivery address</small><strong>{form.formatted_address||'No location confirmed yet'}</strong></span><LockKeyhole aria-label="Locked"/></div><label className="full"><span>Landmark / address hint <small>Optional</small></span><input name="landmark" value={form.landmark} onChange={update} placeholder="Nearby landmark, gate color, or building" /></label><label className="full"><span>Order remarks <small>Optional</small></span><textarea name="order_remarks" value={form.order_remarks} onChange={update} placeholder="Anything the kitchen should know?" /></label></div>{locationError && <p className="form-error" role="alert">{locationError} Please refresh to try again.</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="place-order-button" disabled={submitting || Boolean(locationError) || quoteLoading || (form.fulfillment_type==='doorstep'&&(!form.formatted_address||!hasConfirmedDeliveryPin)) || (requiresDeliveryQuote&&!quoteValid)}>{submitting ? <><Loader2 className="spin" /> Sending to kitchen…</> : quoteLoading?<><Loader2 className="spin"/><span>Calculating delivery…</span></>:<><span><CheckCircle2 /> Place order</span><strong>{previewTotal===null?'—':money(previewTotal)}</strong></>}</button><p className="checkout-note">Payment is settled after the order is placed.</p></form>
  </div>{mapOpen&&<LocationPinModal marketCode={marketCode} latitude={form.latitude} longitude={form.longitude} address={market.countryCode==='GH'?form.formatted_address:(form.formatted_address||[form.house_number,form.barangay,form.city].filter(Boolean).join(', '))} initialLocation={{city:form.city,barangay:form.barangay,house_number:form.house_number}} onClose={()=>setMapOpen(false)} onConfirm={applyPinnedLocation}/>}</main>;
}
