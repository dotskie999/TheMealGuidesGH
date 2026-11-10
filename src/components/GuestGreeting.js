'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, LockKeyhole, MapPin, MapPinned, Save, UserRound, X } from 'lucide-react';
import { useGuest } from '@/context/GuestContext';
import { getMarket, normalizeMarketCode } from '@/lib/markets';
import LocationPinModal, { preloadLocationMap } from '@/components/LocationPinModal';
import { DEPLOYMENT_COUNTRY_NAME } from '@/lib/deployment';

export default function GuestGreeting() {
  const { guest, updateGuest } = useGuest();
  const [open, setOpen] = useState(false);
  const [mapOpen,setMapOpen]=useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !guest) return;
    const marketCode=normalizeMarketCode(guest.market_code);
    const market=getMarket(marketCode);
    setForm({
      ...guest,
      market_code:marketCode,
      country_code:market.countryCode,
      contact_number:guest.contact_number || market.phonePrefix,
      formatted_address:guest.location_source!=='map_pin'?'':(guest.formatted_address || [guest.house_number,guest.barangay,guest.city].filter(Boolean).join(', ')),
    });
    setError('');
  }, [open, guest]);

  useEffect(()=>{
    const timer=window.setTimeout(()=>preloadLocationMap().catch(()=>{}),350);
    return()=>window.clearTimeout(timer);
  },[]);

  if (!guest) return null;
  const firstName = guest.customer_name?.trim().split(/\s+/)[0] || 'there';
  const market = getMarket(form?.market_code || guest.market_code);
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const applyPinnedLocation=(location)=>{
    if(!location) throw new Error('Select a location on the map first.');
    const city=location.city||form.city||market.region;
    const barangay=location.barangay||form.barangay||city||'Pinned location';
    const houseNumber=location.house_number||location.formatted||'Map pin';
    if(!city||!barangay||!houseNumber||!location.formatted) throw new Error('Choose a more specific delivery point before confirming.');
    setForm((current)=>({
      ...current,
      city,
      city_code:'',
      barangay,
      house_number:houseNumber,
      formatted_address:location.formatted||[houseNumber,barangay,city].filter(Boolean).join(', '),
      latitude:location.latitude,
      longitude:location.longitude,
      location_accuracy:null,
      location_source:'map_pin',
      location_precision:'pin',
      digital_address:'',
    }));
    setError('');
    setMapOpen(false);
  };

  const save = async (event) => {
    event.preventDefault(); setError('');
    const phone=String(form.contact_number||'').replace(/\s/g,'');
    const valid=/^\+233\d{9}$/.test(phone);
    if (!valid) { setError(`Use a valid ${market.country} number beginning with ${market.phonePrefix}.`); return; }
    if(!form.formatted_address||!Number.isFinite(Number(form.latitude))||!Number.isFinite(Number(form.longitude))||form.location_source!=='map_pin'){
      setError('Choose and confirm your delivery address on the map.'); return;
    }
    setSaving(true);
    try {
      await updateGuest({ ...form, contact_number:phone });
      setOpen(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return <>
    <button className="guest-greeting" onClick={() => setOpen(true)} aria-label="Edit your guest details">
      <span>Hello, {firstName}!</span>
      <small><MapPin size={13} /> {guest.barangay}, {guest.city} · {getMarket(guest.market_code).country}</small>
    </button>
    {open && form && createPortal(<div className="profile-modal-bg" onMouseDown={(event) => { if(event.target===event.currentTarget) setOpen(false); }}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header><div><p className="kicker">Your saved details</p><h2 id="profile-title">Update your guide card</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X/></button></header>
        <form onSubmit={save} className="profile-form">
          <label className="locked-market"><span>Country <small><LockKeyhole size={12}/> This site</small></span><input value={DEPLOYMENT_COUNTRY_NAME} disabled/></label>
          <label className="locked-market"><span>Service region <small><LockKeyhole size={12}/> This site</small></span><input value={market.region} disabled/></label>
          <label className="full"><span>Customer name</span><input name="customer_name" value={form.customer_name||''} onChange={update} required /></label>
          <label className="full"><span>Email</span><input type="email" name="customer_email" value={form.customer_email||''} onChange={update} required /></label>
          <label className="full"><span>Contact number</span><input name="contact_number" value={form.contact_number||''} onChange={update} inputMode="tel" required /></label>
          <button type="button" className="map-pin-button full" onClick={()=>setMapOpen(true)}><MapPinned/><span><strong>{form.formatted_address?'Edit delivery location':'Choose delivery location'}</strong><small>Use your GPS, search, or move the delivery pin</small></span>{form.location_source==='map_pin'&&<i><CheckCircle2/> Confirmed</i>}</button>
          <div className="locked-address full"><MapPin/><span><small>Confirmed delivery address</small><strong>{form.formatted_address||'No location confirmed yet'}</strong></span><LockKeyhole aria-label="Locked"/></div>
          <label className="full"><span>Landmark / address hint <small>Optional</small></span><input name="landmark" value={form.landmark||''} onChange={update} placeholder="Nearby landmark, gate color, or building" /></label>
          <p className="profile-privacy full"><UserRound size={17}/> Changes are saved to this browser and your secure guest profile. Delivery distance uses the confirmed map pin.</p>
          {error&&<p className="form-error full">{error}</p>}
          <footer className="full"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?<Loader2 className="spin"/>:<Save/>}{saving?'Saving…':'Save details'}</button></footer>
        </form>
      </section>
    </div>, document.body)}
    {mapOpen&&form&&createPortal(<LocationPinModal marketCode={form.market_code} latitude={form.latitude} longitude={form.longitude} address={form.formatted_address} initialLocation={{city:form.city,barangay:form.barangay,house_number:form.house_number}} onClose={()=>setMapOpen(false)} onConfirm={applyPinnedLocation}/>,document.body)}
  </>;
}
