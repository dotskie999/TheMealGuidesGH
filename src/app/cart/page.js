'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, LockKeyhole, MapPin, MapPinned, ShoppingBag, Store, Trash2 } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useGuest } from '@/context/GuestContext';
import { restaurantSlug } from '@/lib/restaurant';
import { getMarket, marketMoney, normalizeMarketCode } from '@/lib/markets';
import LocationPinModal, { preloadLocationMap } from '@/components/LocationPinModal';
import { DEFAULT_DEPLOYMENT_MARKET, DEPLOYMENT_COUNTRY } from '@/lib/deployment';

const initialMarket=getMarket(DEFAULT_DEPLOYMENT_MARKET);
const initialForm={market_code:DEFAULT_DEPLOYMENT_MARKET,country_code:DEPLOYMENT_COUNTRY,fulfillment_type:'doorstep',customer_name:'',customer_email:'',contact_number:initialMarket.phonePrefix,city:'',city_code:'',barangay:'',house_number:'',formatted_address:'',landmark:'',digital_address:'',order_remarks:'',latitude:null,longitude:null,location_accuracy:null,location_source:null,location_precision:null};

function MotorcycleIcon(){return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M8 17h5l2.5-4H18l1 1M8 17l-2-5H3M9 12h4l2 2M13 10l-1-2h3M10 17l3-5"/></svg>}

export default function CartPage(){
  const {items,ready,subtotal,removeItem,clearCart,saveOrder}=useCart();
  const {guest}=useGuest();
  const [form,setForm]=useState(initialForm);
  const [error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [mapOpen,setMapOpen]=useState(false);
  const router=useRouter();
  const marketCode=normalizeMarketCode(form.market_code||guest?.market_code);
  const market=getMarket(marketCode);
  const money=(value)=>marketMoney(value,marketCode);

  useEffect(()=>{
    const timer=window.setTimeout(()=>preloadLocationMap().catch(()=>{}),350);
    return()=>window.clearTimeout(timer);
  },[]);

  useEffect(()=>{
    if(!guest) return;
    const hasConfirmedPin=guest.location_source==='map_pin';
    setForm((current)=>({...current,customer_name:guest.customer_name||'',market_code:DEFAULT_DEPLOYMENT_MARKET,country_code:DEPLOYMENT_COUNTRY,customer_email:guest.customer_email||'',contact_number:guest.contact_number||initialMarket.phonePrefix,city:guest.city||'',city_code:'',barangay:guest.barangay||'',house_number:guest.house_number||'',formatted_address:hasConfirmedPin?(guest.formatted_address||[guest.house_number,guest.barangay,guest.city].filter(Boolean).join(', ')):'',landmark:guest.landmark||'',digital_address:guest.digital_address||'',latitude:guest.latitude??null,longitude:guest.longitude??null,location_accuracy:guest.location_accuracy??null,location_source:hasConfirmedPin?'map_pin':null,location_precision:hasConfirmedPin?'pin':null}));
  },[guest]);

  const update=(event)=>setForm((current)=>({...current,[event.target.name]:event.target.value}));

  const applyPinnedLocation=(location)=>{
    if(!location) throw new Error('Select a location on the map first.');
    const formatted=String(location.formatted||'').trim();
    if(!formatted) throw new Error('Choose a pin that has a recognizable delivery address.');
    const city=location.city||market.region;
    const area=location.barangay||location.city||'Pinned location';
    setForm((current)=>({...current,city_code:'',city,barangay:area,house_number:location.house_number||formatted,formatted_address:formatted,latitude:Number(location.latitude),longitude:Number(location.longitude),location_accuracy:null,location_source:'map_pin',location_precision:'pin',digital_address:''}));
    setError('');
  };

  const submit=async(event)=>{
    event.preventDefault();
    setError('');
    if(form.fulfillment_type==='doorstep'&&(form.location_source!=='map_pin'||!Number.isFinite(Number(form.latitude))||!Number.isFinite(Number(form.longitude)))){setError('Confirm your exact delivery pin on the map.');return;}
    if(form.fulfillment_type==='doorstep'&&!form.formatted_address){setError('Choose and confirm the delivery address on the map.');return;}
    const contact=form.contact_number.replace(/\s/g,'');
    if(!/^\+233\d{9}$/.test(contact)){setError('Use a valid Ghana number beginning with +233.');return;}
    setSubmitting(true);
    try{
      const {city_code,...address}=form;
      const payload={restaurant_id:items[0].restaurant_id,items:items.map(({cart_id,...item})=>item),subtotal,...address,market_code:DEFAULT_DEPLOYMENT_MARKET,country_code:DEPLOYMENT_COUNTRY,contact_number:contact,fulfillment_type:form.fulfillment_type};
      const response=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok||!result.order_number) throw new Error(result.error||'The kitchen could not place your order.');
      saveOrder({...payload,...result,items,status:'Pending payment'});
      clearCart();
      router.push(`/receipt/${encodeURIComponent(result.order_number)}`);
    }catch(err){setError(err.message);setSubmitting(false);}
  };

  if(!ready) return <main className="center-page"><Loader2 className="spin"/></main>;
  if(!items.length) return <main className="center-page"><div className="empty-cart"><span><ShoppingBag/></span><p className="kicker">Your cart</p><h1>Still deciding?</h1><p>Your next favorite meal is waiting.</p><Link href="/" className="primary-button">Browse kitchens</Link></div></main>;

  const menuUrl=items[0].restaurant_slug||(items[0].restaurant_name?restaurantSlug(items[0].restaurant_name):items[0].restaurant_id);
  const hasConfirmedDeliveryPin=form.location_source==='map_pin'&&Number.isFinite(Number(form.latitude))&&Number.isFinite(Number(form.longitude));
  return <main className="checkout-page"><header className="checkout-header"><Link href={`/restaurant/${menuUrl}`} className="back-link"><ArrowLeft size={19}/> Back to menu</Link><p className="kicker">Almost yours</p><h1>Review & checkout</h1><p>One last look before we send it to the kitchen.</p></header><div className="checkout-layout">
    <section className="cart-review"><div className="block-heading"><h2>Your order</h2><span>{items.length} {items.length===1?'item':'items'}</span></div><div className="fulfillment-choice" role="radiogroup" aria-label="Order fulfillment"><label className={form.fulfillment_type==='doorstep'?'selected':''}><input type="radio" name="fulfillment_type" value="doorstep" checked={form.fulfillment_type==='doorstep'} onChange={update}/><MotorcycleIcon/><span><strong>Book my own ride</strong><small>Arrange and pay your rider directly</small></span></label><label className={form.fulfillment_type==='pickup'?'selected':''}><input type="radio" name="fulfillment_type" value="pickup" checked={form.fulfillment_type==='pickup'} onChange={update}/><Store/><span><strong>Store pickup</strong><small>Collect your order from the kitchen</small></span></label></div><div className="cart-items">{items.map((item)=><article className="cart-item" key={item.cart_id}><span className="quantity-badge">{item.quantity}×</span><div><h3>{item.name}</h3>{item.selected_options?.length>0&&<p>{item.selected_options.map((option)=>option.option_name).join(' · ')}</p>}{item.remarks&&<em>“{item.remarks}”</em>}</div><div className="cart-item-end"><strong>{money(item.total_price)}</strong><button onClick={()=>removeItem(item.cart_id)} aria-label={`Remove ${item.name}`}><Trash2 size={18}/></button></div></article>)}</div><div className="checkout-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Delivery</span><strong>{form.fulfillment_type==='pickup'?'Store pickup':'Paid directly to your rider'}</strong></div><div className="grand-total"><span>Order total</span><strong>{money(subtotal)}</strong></div></div></section>
    <form className="checkout-form" onSubmit={submit}><div className="block-heading"><div><p className="kicker">Guest details</p><h2>Check your details</h2><p className="prefill-note">We filled these in from your Greater Accra profile. Please check anything you can edit before ordering.</p></div><MapPin/></div><div className="form-grid"><label className="full"><span>Name</span><input name="customer_name" value={form.customer_name} onChange={update} placeholder="Customer name" required/></label><label className="full"><span>Email</span><input type="email" name="customer_email" value={form.customer_email} onChange={update} placeholder="you@example.com" required/></label><label className="full"><span>Contact number</span><input name="contact_number" value={form.contact_number} onChange={update} inputMode="tel" placeholder="+233" required/></label><button type="button" className="map-pin-button full" onClick={()=>setMapOpen(true)}><MapPinned/><span><strong>{form.formatted_address?'Edit delivery location':'Choose delivery location'}</strong><small>Use your GPS, search, or move the delivery pin</small></span>{form.location_source==='map_pin'&&<i><CheckCircle2/> Confirmed</i>}</button><div className="locked-address full"><MapPin/><span><small>Confirmed delivery address</small><strong>{form.formatted_address||'No location confirmed yet'}</strong></span><LockKeyhole aria-label="Locked"/></div><label className="full"><span>Landmark / address hint <small>Optional</small></span><input name="landmark" value={form.landmark} onChange={update} placeholder="Nearby landmark, gate color, or building"/></label><label className="full"><span>Order remarks <small>Optional</small></span><textarea name="order_remarks" value={form.order_remarks} onChange={update} placeholder="Anything the kitchen should know?"/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}<button className="place-order-button" disabled={submitting||(form.fulfillment_type==='doorstep'&&(!form.formatted_address||!hasConfirmedDeliveryPin))}>{submitting?<><Loader2 className="spin"/> Sending to kitchen…</>:<><span><CheckCircle2/> Place order</span><strong>{money(subtotal)}</strong></>}</button><p className="checkout-note">Payment is settled after the order is placed. Rider fees are arranged separately.</p></form>
  </div>{mapOpen&&<LocationPinModal marketCode={marketCode} latitude={form.latitude} longitude={form.longitude} address={form.formatted_address} initialLocation={{city:form.city,barangay:form.barangay,house_number:form.house_number}} onClose={()=>setMapOpen(false)} onConfirm={applyPinnedLocation}/>}</main>;
}
