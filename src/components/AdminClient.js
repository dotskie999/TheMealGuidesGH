'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Bell, BellRing, CalendarDays, Check, ChefHat, ChevronDown, CircleDollarSign, ClipboardList, Download, Eye, Filter, KeyRound, Layers3, Loader2, LockKeyhole, LogOut, Mail, MapPin, Phone, Plus, RefreshCw, Save, Settings2, ShieldAlert, Store, Trash2, Truck, UserRound, Users, Utensils, X } from 'lucide-react';
import { normalizeImageUrl } from '@/lib/images';
import { MARKET_OPTIONS, marketMoney, normalizeMarketCode } from '@/lib/markets';
import AdminPasswordChange from '@/components/AdminPasswordChange';
import { DEFAULT_WEEKLY_HOURS, marketTimezone, normalizeWeeklyHours, RESTAURANT_DAYS, restaurantAvailability } from '@/lib/restaurantHours';
import { DEFAULT_DEPLOYMENT_MARKET, DEPLOYMENT_COUNTRY, DEPLOYMENT_COUNTRY_NAME, DEPLOYMENT_TIMEZONE } from '@/lib/deployment';

const money = (v) => marketMoney(v,DEFAULT_DEPLOYMENT_MARKET);
const emptyData = { restaurants: [], categories: [], menuItems: [], optionGroups: [], options: [], guests: [], adminAccounts: [], deliverySettings:null };
const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
const CACHE_KEY = 'tmg-admin-snapshot-v1';
const dateKey = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone:DEPLOYMENT_TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
};
const todayKey = () => dateKey(new Date());
async function request(action, body) {
  const response = await fetch(body ? '/api/admin' : `/api/admin?action=${encodeURIComponent(action)}`, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  } : { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'Request failed.');
  return result;
}

const roleLabel = { inventory:'Inventory', admin:'Admin', super_admin:'Super Admin' };

function playOrderChime(context) {
  if(!context||context.state!=='running') return;
  const started=context.currentTime;
  [[0,784],[.16,1047],[.32,1319]].forEach(([delay,frequency])=>{
    const oscillator=context.createOscillator(); const gain=context.createGain();
    oscillator.type='sine'; oscillator.frequency.setValueAtTime(frequency,started+delay);
    gain.gain.setValueAtTime(.0001,started+delay); gain.gain.exponentialRampToValueAtTime(.2,started+delay+.02); gain.gain.exponentialRampToValueAtTime(.0001,started+delay+.28);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(started+delay); oscillator.stop(started+delay+.3);
  });
}

export default function AdminClient({session}) {
  const isSuperAdmin=session.role==='super_admin';
  const cacheKey=`${CACHE_KEY}-${DEPLOYMENT_COUNTRY.toLowerCase()}-${session.role}`;
  const [tab, setTab] = useState(session.role==='inventory'?'restaurants':'orders');
  const [orders, setOrders] = useState([]);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportDate, setReportDate] = useState(todayKey);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [restaurantMarket, setRestaurantMarket] = useState('all');
  const [menuRestaurant, setMenuRestaurant] = useState('all');
  const [menuCategory, setMenuCategory] = useState('all');
  const [addonCategory, setAddonCategory] = useState('all');
  const [guestSort,setGuestSort]=useState('recent');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [passwordOpen,setPasswordOpen]=useState(false);
  const [alertsEnabled,setAlertsEnabled]=useState(false);
  const [newOrderAlert,setNewOrderAlert]=useState(null);
  const knownOrders=useRef(new Set());
  const orderBaselineReady=useRef(false);
  const audioContext=useRef(null);

  const load = useCallback(async () => { setLoading(true); setError(''); try { const snapshot=await request('getAdminSnapshot'); setOrders(Array.isArray(snapshot.orders)?snapshot.orders:[]); setData({ ...emptyData, ...snapshot }); localStorage.setItem(cacheKey,JSON.stringify(snapshot)); } catch(e) { setError(e.message); } finally { setLoading(false); } }, [cacheKey]);
  useEffect(() => { localStorage.removeItem(CACHE_KEY); try { const cached=JSON.parse(localStorage.getItem(cacheKey)||'null'); if(cached){setOrders(cached.orders||[]);setData({...emptyData,...cached});setLoading(false);} } catch {} load(); }, [cacheKey,load]);
  useEffect(()=>{
    if(session.role==='inventory'||loading||orderBaselineReady.current) return;
    knownOrders.current=new Set(orders.map(order=>String(order.order_number)));
    orderBaselineReady.current=true;
  },[loading,orders,session.role]);
  useEffect(()=>{
    if(session.role==='inventory') return;
    let disposed=false;
    const checkForOrders=async()=>{
      try{
        const latest=await request('getOrders');
        if(disposed||!Array.isArray(latest)) return;
        if(!orderBaselineReady.current){knownOrders.current=new Set(latest.map(order=>String(order.order_number)));orderBaselineReady.current=true;setOrders(latest);return;}
        const incoming=latest.filter(order=>!knownOrders.current.has(String(order.order_number)));
        latest.forEach(order=>knownOrders.current.add(String(order.order_number)));
        setOrders(latest);
        if(!incoming.length) return;
        const newest=incoming.slice().sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0];
        setNewOrderAlert({...newest,count:incoming.length});
        if(alertsEnabled&&typeof Notification!=='undefined'&&Notification.permission==='granted') new Notification(incoming.length===1?`New order #${newest.order_number}`:`${incoming.length} new orders`,{body:`${newest.customer_name||'A customer'} placed an order.`,tag:`meal-guides-order-${newest.order_number}`});
      }catch{}
    };
    const timer=window.setInterval(checkForOrders,8000);
    return()=>{disposed=true;window.clearInterval(timer);};
  },[alertsEnabled,session.role]);
  useEffect(()=>{
    if(!alertsEnabled||!newOrderAlert) return;
    playOrderChime(audioContext.current);
    const timer=window.setInterval(()=>playOrderChime(audioContext.current),4000);
    return()=>window.clearInterval(timer);
  },[alertsEnabled,newOrderAlert]);
  useEffect(()=>{
    if(newOrderAlert&&String(expandedOrder)===String(newOrderAlert.order_number)) setNewOrderAlert(null);
  },[expandedOrder,newOrderAlert]);
  useEffect(()=>()=>{audioContext.current?.close?.();},[]);
  const reportOrders = useMemo(() => orders.filter(order => dateKey(order.created_at) === reportDate), [orders,reportDate]);
  const sortedGuests=useMemo(()=>data.guests.slice().sort((a,b)=>{
    if(guestSort==='top') return Number(b.visit_count||0)-Number(a.visit_count||0) || new Date(b.last_visited_at||0)-new Date(a.last_visited_at||0);
    if(guestSort==='az') return String(a.customer_name||'').localeCompare(String(b.customer_name||''),undefined,{sensitivity:'base'}) || new Date(b.last_visited_at||0)-new Date(a.last_visited_at||0);
    return new Date(b.last_visited_at||0)-new Date(a.last_visited_at||0);
  }),[data.guests,guestSort]);
  const filteredRestaurants = useMemo(() => {
    const marketOrder = new Map(MARKET_OPTIONS.map((market,index) => [market.code,index]));
    const restaurants = restaurantMarket === 'all' ? data.restaurants : data.restaurants.filter(restaurant => normalizeMarketCode(restaurant.market_code) === restaurantMarket);
    return restaurants.slice().sort((a,b) => {
      const marketDifference = (marketOrder.get(normalizeMarketCode(a.market_code)) ?? Number.MAX_SAFE_INTEGER) - (marketOrder.get(normalizeMarketCode(b.market_code)) ?? Number.MAX_SAFE_INTEGER);
      const aPosition = Number(a.sort_order) > 0 ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
      const bPosition = Number(b.sort_order) > 0 ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
      return marketDifference || aPosition - bPosition || String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [data.restaurants,restaurantMarket]);
  const filteredCategories = useMemo(() => {
    const restaurantOrder = new Map(data.restaurants.map((restaurant,index) => [String(restaurant.restaurant_id),index]));
    const categories = menuRestaurant === 'all' ? data.categories : data.categories.filter(category => String(category.restaurant_id) === menuRestaurant);
    return categories.slice().sort((a,b) => (restaurantOrder.get(String(a.restaurant_id)) ?? Number.MAX_SAFE_INTEGER) - (restaurantOrder.get(String(b.restaurant_id)) ?? Number.MAX_SAFE_INTEGER) || Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  }, [data.categories,data.restaurants,menuRestaurant]);
  const filteredMenuItems = useMemo(() => {
    const categoryOrder = new Map(data.categories.map(category => [String(category.category_id), Number(category.sort_order || 0)]));
    const restaurantItems = menuRestaurant === 'all' ? data.menuItems : data.menuItems.filter(item => String(item.restaurant_id) === menuRestaurant);
    const items = menuCategory === 'all' ? restaurantItems : restaurantItems.filter(item => String(item.category_id) === menuCategory);
    return items.slice().sort((a,b) => (categoryOrder.get(String(a.category_id)) || 0) - (categoryOrder.get(String(b.category_id)) || 0) || Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  }, [data.menuItems,data.categories,menuRestaurant,menuCategory]);
  const filteredGroups = useMemo(() => addonCategory === 'all' ? data.optionGroups : data.optionGroups.filter(group => {
    if (String(group.category_id) === addonCategory) return true;
    const targetItem = data.menuItems.find(item => String(item.item_id) === String(group.item_id));
    return String(targetItem?.category_id) === addonCategory;
  }), [data.optionGroups,data.menuItems,addonCategory]);
  const filteredOptions = useMemo(() => { if(addonCategory==='all') return data.options; const groupIds=new Set(filteredGroups.map(group=>String(group.group_id))); return data.options.filter(option=>groupIds.has(String(option.group_id))); }, [data.options,filteredGroups,addonCategory]);
  const restaurantMoney=(value,restaurantId)=>marketMoney(value,data.restaurants.find(restaurant=>String(restaurant.restaurant_id)===String(restaurantId))?.market_code||DEFAULT_DEPLOYMENT_MARKET);
  const optionRestaurantId=(option)=>{
    const group=data.optionGroups.find(entry=>String(entry.group_id)===String(option.group_id));
    const item=group?.item_id?data.menuItems.find(entry=>String(entry.item_id)===String(group.item_id)):null;
    const category=data.categories.find(entry=>String(entry.category_id)===String(group?.category_id||item?.category_id));
    return item?.restaurant_id||category?.restaurant_id;
  };
  const stats = useMemo(() => ({ active:reportOrders.filter(o=>!['completed','cancelled'].includes(String(o.status).toLowerCase())).length, sales:reportOrders.filter(o=>String(o.status).toLowerCase()!=='cancelled').reduce((s,o)=>s+Number(o.order_total??o.subtotal??0),0), completed:reportOrders.filter(o=>String(o.status).toLowerCase()==='completed').length }), [reportOrders]);
  const downloadReport = () => { const rows=[['Order','Time','Customer','Contact','City','Barangay','Address','Landmark','Items','Add-ons','Item remarks','Order remarks','Fulfillment','Delivery provider','Status','Subtotal','Delivery fee','Total'],...reportOrders.map(o=>[o.order_number,o.created_at,o.customer_name,o.contact_number,o.city,o.barangay,o.house_number,o.landmark||'',(o.items||[]).map(i=>`${i.quantity}x ${i.name}`).join('; '),(o.items||[]).flatMap(i=>(i.selected_options||[]).map(x=>`${i.name}: ${x.option_name} (+${x.price||0})`)).join('; '),(o.items||[]).filter(i=>i.remarks).map(i=>`${i.name}: ${i.remarks}`).join('; '),o.order_remarks||'',o.fulfillment_type||'doorstep',o.delivery_provider||'',o.status,o.subtotal,o.delivery_fee||0,o.order_total??o.subtotal])]; const csv=rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\r\n'); const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); const a=document.createElement('a');a.href=url;a.download=`meal-guides-orders-${reportDate}.csv`;a.click();URL.revokeObjectURL(url); };
  const updateStatus = async (order_number, new_status) => { const current=orders.find(o=>String(o.order_number)===String(order_number)); if(String(current?.status).toLowerCase()==='completed') return; const previous=orders; setOrders(rows=>rows.map(o=>String(o.order_number)===String(order_number)?{...o,status:new_status}:o)); try { await request('updateOrderStatus',{order_number,new_status}); } catch(e){setOrders(previous);setError(e.message);} };
  const enableOrderAlerts=async()=>{
    try{
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextClass) throw new Error('Audio alerts are not supported by this browser.');
      audioContext.current ||= new AudioContextClass();
      await audioContext.current.resume(); setAlertsEnabled(true); playOrderChime(audioContext.current);
      if(typeof Notification!=='undefined'&&Notification.permission==='default') Notification.requestPermission().catch(()=>{});
    }catch(reason){setError(reason.message||'Could not enable notification sounds.');}
  };
  const openNewOrder=()=>{if(!newOrderAlert)return;setTab('orders');setReportDate(dateKey(newOrderAlert.created_at)||todayKey());setExpandedOrder(newOrderAlert.order_number);setNewOrderAlert(null);};
  const save = async () => { setSaving(true); setError(''); try { const map={restaurant:'saveRestaurant',category:'saveCategory',menu:'saveMenuItem',group:'saveOptionGroup',option:'saveOption',account:'saveAdminAccount',delivery:'saveDeliverySettings'}; await request(map[editor.type],{record:editor.record}); setEditor(null); await load(); } catch(e){setError(e.message);} finally{setSaving(false);} };
  const edit = (type, record={}) => {
    const chosenMenuCategory=menuCategory!=='all'?data.categories.find(category=>String(category.category_id)===menuCategory):null;
    const restaurantId=menuRestaurant!=='all'?menuRestaurant:chosenMenuCategory?.restaurant_id||data.restaurants[0]?.restaurant_id||'';
    const firstCategory=chosenMenuCategory||data.categories.find(category=>String(category.restaurant_id)===String(restaurantId));
    const selectedCategory=addonCategory!=='all'?addonCategory:data.categories[0]?.category_id||'';
    const selectedGroup=filteredGroups[0]?.group_id||data.optionGroups[0]?.group_id||'';
    const targetItem=data.menuItems.find(item=>String(item.item_id)===String(record.item_id));
    const defaultMarket=restaurantMarket!=='all'?restaurantMarket:DEFAULT_DEPLOYMENT_MARKET;
    const defaults={restaurant:{restaurant_id:'',market_code:defaultMarket,name:'',address:'',latitude:'',longitude:'',delivery_radius_km:10,sort_order:1,logo_url:'',banner_url:'',description:'',active:'yes',timezone:marketTimezone(defaultMarket),weekly_hours:DEFAULT_WEEKLY_HOURS,orders_paused:false,pause_message:''},category:{category_id:'',restaurant_id:restaurantId,name:'',active:'yes',sort_order:1},menu:{item_id:'',restaurant_id:restaurantId,category_id:firstCategory?.category_id||'',name:'',description:'',base_price:'',photo_url:'',active:'yes',sort_order:1},group:{group_id:'',scope:'category',scope_category_id:selectedCategory,category_id:selectedCategory,item_id:'',group_name:'',selection_type:'multiple',required:'no',sort_order:1},option:{option_id:'',group_id:selectedGroup,option_name:'',price:0,sort_order:1},account:{user_id:'',display_name:'',username:'',password:'',role:'inventory',active:true},delivery:{market_code:'ph-ncr',base_distance_km:2.2,base_fare:38,additional_per_km:6,max_internal_distance_km:7.2,peak_surcharge:25,lunch_peak_start:'11:00',lunch_peak_end:'13:30',dinner_peak_start:'17:00',dinner_peak_end:'20:30',storm_surcharge:30,storm_active:false,active:true}};
    const nextRecord={...defaults[type],...record};
    if(type==='restaurant') { nextRecord.market_code=normalizeMarketCode(record.market_code||defaultMarket); nextRecord.weekly_hours=normalizeWeeklyHours(record.weekly_hours||DEFAULT_WEEKLY_HOURS); }
    if(type==='group') Object.assign(nextRecord,{scope:record.item_id?'item':'category',scope_category_id:record.category_id||targetItem?.category_id||selectedCategory});
    setEditor({type,record:nextRecord});
  };
  const logout = async () => { localStorage.removeItem(cacheKey); await fetch('/api/admin/auth',{method:'DELETE'}); window.location.reload(); };
  const askDelete = (type, id, name) => { setDeleteTarget({type,id,name}); setDeleteError(''); };
  const confirmDelete = async (event) => {
    event.preventDefault(); setDeleting(true); setDeleteError('');
    try {
      await request(deleteTarget.type==='group'?'deleteOptionGroup':'deleteOption',{id:deleteTarget.id});
      setDeleteTarget(null); await load();
    } catch(e) { setDeleteError(e.message); }
    finally { setDeleting(false); }
  };
  const navigation=session.role==='inventory'
    ? [['restaurants',Store,'Restaurants'],['menu',Utensils,'Menu & pricing'],['addons',Layers3,'Add-ons & extras']]
    : [['orders',ClipboardList,'Orders'],['guests',UserRound,'Guests'],['restaurants',Store,'Restaurants'],['menu',Utensils,'Menu & pricing'],['addons',Layers3,'Add-ons & extras'],...(isSuperAdmin?[...(DEPLOYMENT_COUNTRY==='PH'?[['delivery',Truck,'Delivery settings']]:[]),['accounts',Users,'Team accounts']]:[])];

    return <main className="admin-page"><aside className="admin-sidebar"><div className="admin-brand"><Image src="/the-meal-guides-logo.png" alt="" width={62} height={45}/><div><strong>meal guides</strong><small>{roleLabel[session.role]}</small></div></div><nav>{navigation.map(([id,Icon,label])=><button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}><Icon size={20}/><span>{label}</span></button>)}</nav><div className="admin-sidebar-actions"><div className={`admin-identity ${session.emergency?'emergency':''}`}>{session.emergency?<ShieldAlert size={17}/>:<UserRound size={17}/>}<span><strong>{session.displayName}</strong><small>{session.emergency?'Temporary full access':roleLabel[session.role]}</small></span></div>{!session.emergency&&<button onClick={()=>setPasswordOpen(true)} className="admin-password-button"><KeyRound size={18}/> Change password</button>}<a href="/" className="admin-store-link"><ChefHat size={18}/> View storefront</a><button onClick={logout} className="admin-logout"><LogOut size={18}/> Sign out</button></div></aside>
    <section className="admin-workspace">{session.emergency&&<div className="emergency-session-banner"><ShieldAlert/> {DEPLOYMENT_COUNTRY_NAME} emergency Super Admin session · All actions are logged</div>}<header className="admin-topbar"><div><p className="kicker">{DEPLOYMENT_COUNTRY_NAME} control center · {roleLabel[session.role]}</p><h1>{tab==='orders'?'Live orders':tab==='guests'?'Guest information':tab==='restaurants'?'Restaurants':tab==='menu'?'Menu & pricing':tab==='accounts'?'Team accounts':tab==='delivery'?'Delivery settings':'Add-ons & extras'}</h1></div><div className="admin-topbar-actions">{session.role!=='inventory'&&<button className={`admin-refresh order-alert-toggle ${alertsEnabled?'active':''}`} onClick={enableOrderAlerts} title={alertsEnabled?'Play test sound':'Enable new-order sound'}>{alertsEnabled?<BellRing/>:<Bell/>}<span>{alertsEnabled?'Alerts on':'Enable alerts'}</span></button>}{!session.emergency&&<button className="admin-refresh admin-password-mobile" onClick={()=>setPasswordOpen(true)}><KeyRound/><span>Password</span></button>}<button className="admin-refresh" onClick={load} disabled={loading}>{loading?<Loader2 className="spin"/>:<RefreshCw/>}<span>Refresh</span></button></div></header>
      {error&&<div className="admin-alert"><span>{error}</span><button onClick={()=>setError('')}><X size={18}/></button></div>}
      {newOrderAlert&&<div className="new-order-alert" role="alert"><BellRing/><button onClick={openNewOrder}><strong>{newOrderAlert.count===1?`New order #${newOrderAlert.order_number}`:`${newOrderAlert.count} new orders received`}</strong><small>{newOrderAlert.customer_name||'Customer'} · Sound repeats until you open the order</small></button></div>}
      {tab==='orders'&&<>
        <div className="report-toolbar"><label><CalendarDays/><span>Report date</span><input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label><button onClick={downloadReport} disabled={!reportOrders.length}><Download/> Download daily report</button></div>
        <div className="admin-stats"><article><ClipboardList/><span>Active on selected day</span><strong>{stats.active}</strong></article><article><CircleDollarSign/><span>Total ordered on selected day</span><strong>{money(stats.sales)}</strong></article><article><Check/><span>Completed on selected day</span><strong>{stats.completed}</strong></article></div>
        <div className="admin-panel"><div className="admin-panel-head"><div><h2>Orders for {new Date(`${reportDate}T12:00:00`).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}</h2><p>Open an order to see every item, add-on, address, and remark.</p></div><span className="live-badge"><i/> {reportOrders.length} orders</span></div>{loading?<AdminLoading/>:<div className="order-table">{reportOrders.length===0?<CollectionEmpty label="orders for this date"/>:reportOrders.slice().reverse().map(order=>{const locked=String(order.status).toLowerCase()==='completed';const open=expandedOrder===order.order_number;return <article className={`admin-order-wrap ${locked?'order-locked':''}`} key={order.order_number}><div className="admin-order"><div className="admin-order-number"><small>Order</small><strong>#{order.order_number}</strong><span>{order.created_at?new Date(order.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</span></div><div><strong>{order.customer_name}</strong><p>{order.contact_number} · {order.barangay}, {order.city}</p><small>{order.items?.map(i=>`${i.quantity}× ${i.name}`).join(' · ')}</small></div><b>{money(order.order_total??order.subtotal)}</b><div className="order-actions"><button className="details-button" onClick={()=>setExpandedOrder(open?null:order.order_number)}><Eye/> {open?'Hide':'Details'}</button>{locked?<div className="completed-lock"><LockKeyhole size={16}/><span>Completed</span><small>Locked</small></div>:<label className={`status-select status-${order.status}`}><select value={String(order.status).toLowerCase()} onChange={e=>updateStatus(order.order_number,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={16}/></label>}</div></div>{open&&<OrderDetails order={order}/>}</article>})}</div>}</div>
      </>}
      {tab==='guests'&&<><div className="admin-filter-bar"><span><Filter size={17}/> Sort guests by</span><select value={guestSort} onChange={event=>setGuestSort(event.target.value)}><option value="recent">Most recent visitors</option><option value="top">Top visitors</option><option value="az">A–Z</option></select><small>{sortedGuests.length} guest profiles</small></div><div className="admin-panel"><div className="admin-panel-head"><div><div className="title-with-count"><h2>Consented guest profiles</h2><span>{sortedGuests.length}</span></div><p>Delivery and contact details submitted by guests, with their visit history.</p></div></div>{loading?<AdminLoading/>:sortedGuests.length===0?<CollectionEmpty label="guest profiles"/>:<div className="guest-admin-grid">{sortedGuests.map(guest=><article className="guest-admin-card" key={guest.guest_id}><header><span><UserRound size={18}/></span><div><h3>{guest.customer_name}</h3><small>{Number(guest.visit_count||1)} {Number(guest.visit_count||1)===1?'visit':'visits'} · Last seen {new Date(guest.last_visited_at).toLocaleString()}</small></div></header><p><Mail size={16}/><a href={`mailto:${guest.customer_email}`}>{guest.customer_email}</a></p><p><Phone size={16}/><a href={`tel:${guest.contact_number}`}>{guest.contact_number}</a></p><p><MapPin size={16}/><span>{guest.house_number}, {guest.barangay}, {guest.city}{guest.landmark?` · ${guest.landmark}`:''}</span></p><footer>Consent recorded {new Date(guest.consent_at).toLocaleString()}</footer></article>)}</div>}</div></>}
      {tab==='restaurants'&&<>
        <div className="admin-filter-bar">
          <span><Filter size={17}/> Filter restaurants by</span>
          <select value={restaurantMarket} onChange={event=>setRestaurantMarket(event.target.value)}>
            <option value="all">All markets</option>
            {MARKET_OPTIONS.map(market=><option value={market.code} key={market.code}>{market.label}</option>)}
          </select>
          <small>{filteredRestaurants.length} restaurants</small>
        </div>
        <AdminCollection title="Restaurant brands" count={filteredRestaurants.length} emptyLabel="restaurants in this market" description="Set a storefront position to control which restaurant appears first in each market." action="Add restaurant" onAdd={()=>edit('restaurant')} loading={loading}>
          {filteredRestaurants.map(r=>{
            const market=MARKET_OPTIONS.find(option=>option.code===normalizeMarketCode(r.market_code));
            const availability=restaurantAvailability(r);
            return <article className="entity-card" key={r.restaurant_id}><div className="entity-image">{normalizeImageUrl(r.logo_url)?<Image src={normalizeImageUrl(r.logo_url)} alt="" fill sizes="76px" unoptimized referrerPolicy="no-referrer"/>:<Store/>}</div><div><span className={`entity-status ${availability.isOpen?'on':'closed'}`}>{availability.label}</span><h3>{r.name}</h3><p>{r.description}</p><small>{market?.label||r.market_code} · {availability.detail} · {Number(r.sort_order)>0?`Position ${r.sort_order}`:'No position set'}</small></div><button onClick={()=>edit('restaurant',r)}><Settings2/> Edit</button></article>;
          })}
        </AdminCollection>
      </>}
      {tab==='menu'&&<><div className="admin-filter-bar menu-filter-bar"><span><Filter size={17}/> Filter menu by</span><select value={menuRestaurant} onChange={event=>{setMenuRestaurant(event.target.value);setMenuCategory('all');}}><option value="all">All restaurants</option>{data.restaurants.map(restaurant=><option value={String(restaurant.restaurant_id)} key={restaurant.restaurant_id}>{restaurant.name}</option>)}</select><select value={menuCategory} onChange={event=>setMenuCategory(event.target.value)}><option value="all">All categories</option>{filteredCategories.map(category=><option value={String(category.category_id)} key={category.category_id}>{category.name}</option>)}</select><small>{filteredMenuItems.length} items · {filteredCategories.length} categories</small></div><AdminCollection title="Menu categories" count={filteredCategories.length} emptyLabel="categories for this restaurant" description="Create categories first, then assign menu items from a dropdown." action="Create category" onAdd={()=>edit('category')} loading={loading}>{filteredCategories.map(category=><article className="compact-entity" key={category.category_id}><div><span>{category.active==='yes'?'Active':'Hidden'}</span><h3>{category.name}</h3><p>{data.restaurants.find(r=>String(r.restaurant_id)===String(category.restaurant_id))?.name||category.restaurant_id}</p></div><button onClick={()=>edit('category',category)}>Edit</button></article>)}</AdminCollection><AdminCollection title="Menu items" count={filteredMenuItems.length} emptyLabel="menu items for this category" description="Active and hidden items for the selected restaurant and category." action="Add menu item" onAdd={()=>edit('menu')} loading={loading}>{filteredMenuItems.map(item=><article className="entity-card" key={item.item_id}><div className="entity-image">{normalizeImageUrl(item.photo_url)?<Image src={normalizeImageUrl(item.photo_url)} alt="" fill sizes="76px" unoptimized referrerPolicy="no-referrer"/>:<Utensils/>}</div><div><span className={`entity-status ${item.active==='yes'?'on':''}`}>{item.active==='yes'?'Active':'Hidden'}</span><h3>{item.name}</h3><p>{data.categories.find(c=>String(c.category_id)===String(item.category_id))?.name||item.category} · {restaurantMoney(item.base_price,item.restaurant_id)}</p><small>{data.restaurants.find(r=>String(r.restaurant_id)===String(item.restaurant_id))?.name||item.restaurant_id}</small></div><button onClick={()=>edit('menu',item)}><Settings2/> Edit</button></article>)}</AdminCollection></>}
      {tab==='delivery'&&isSuperAdmin&&<AdminCollection title="Philippines delivery fare" count={data.deliverySettings?1:0} emptyLabel="delivery settings" description="Controls Metro Manila doorstep fees. Ghana remains fee-free, and pickup is always ₱0." action="Edit matrix" onAdd={()=>edit('delivery',data.deliverySettings||{})} loading={loading}>{data.deliverySettings&&<article className="delivery-settings-card"><header><span><Truck/></span><div><h3>Internal fleet matrix</h3><p>{data.deliverySettings.active?'Active':'Disabled'} · Storm surcharge {data.deliverySettings.storm_active?'ON':'OFF'}</p></div><button onClick={()=>edit('delivery',data.deliverySettings)}><Settings2/> Edit</button></header><div><span>Base zone<strong>₱{Number(data.deliverySettings.base_fare).toFixed(2)}</strong><small>0–{Number(data.deliverySettings.base_distance_km).toFixed(2)} km</small></span><span>Additional km<strong>+₱{Number(data.deliverySettings.additional_per_km).toFixed(2)}</strong><small>Ceiling rule</small></span><span>Peak<strong>+₱{Number(data.deliverySettings.peak_surcharge).toFixed(2)}</strong><small>{String(data.deliverySettings.lunch_peak_start).slice(0,5)}–{String(data.deliverySettings.lunch_peak_end).slice(0,5)} · {String(data.deliverySettings.dinner_peak_start).slice(0,5)}–{String(data.deliverySettings.dinner_peak_end).slice(0,5)}</small></span><span>Storm<strong>+₱{Number(data.deliverySettings.storm_surcharge).toFixed(2)}</strong><small>Manual toggle</small></span><span>Fleet boundary<strong>{Number(data.deliverySettings.max_internal_distance_km).toFixed(2)} km</strong><small>Beyond: Lalamove</small></span></div></article>}</AdminCollection>}
      {tab==='accounts'&&isSuperAdmin&&<AdminCollection title="Staff accounts" count={data.adminAccounts.length} emptyLabel="staff accounts" description="Create username-based staff logins and control their dashboard role. New and reset passwords must be changed by the staff member at their next sign-in." action="Add account" onAdd={()=>edit('account')} loading={loading}>{data.adminAccounts.map(account=><article className="compact-entity" key={account.user_id}><div><span>{account.active?'Active':'Disabled'} · {roleLabel[account.role]||account.role}{account.must_change_password?' · Password change required':''}</span><h3>{account.display_name}</h3><p>@{account.username}</p></div><button onClick={()=>edit('account',account)}>Edit</button></article>)}</AdminCollection>}
      {tab==='addons'&&<><div className="admin-filter-bar"><span><Filter size={17}/> Filter add-ons by</span><select value={addonCategory} onChange={event=>setAddonCategory(event.target.value)}><option value="all">All categories</option>{data.restaurants.map(restaurant=><optgroup label={restaurant.name} key={restaurant.restaurant_id}>{data.categories.filter(category=>String(category.restaurant_id)===String(restaurant.restaurant_id)).map(category=><option value={String(category.category_id)} key={category.category_id}>{category.name}</option>)}</optgroup>)}</select><small>{filteredGroups.length} groups · {filteredOptions.length} choices</small></div><div className="addon-columns"><AdminCollection title="Add-on groups" count={filteredGroups.length} emptyLabel="option groups for this category" description="Apply a group to a whole category or exclusively to one menu item." action="Add group" onAdd={()=>edit('group')} loading={loading}>{filteredGroups.map(g=>{const targetItem=data.menuItems.find(item=>String(item.item_id)===String(g.item_id));const targetCategory=data.categories.find(c=>String(c.category_id)===String(g.category_id||targetItem?.category_id));return <article className="compact-entity" key={g.group_id}><div><span>{g.selection_type} · {g.required==='yes'?'required':'optional'}</span><h3>{g.group_name}</h3><p>{targetItem?`${targetCategory?.name||'Category'} · Only ${targetItem.name}`:targetCategory?.name||'Category-wide'}</p></div><div className="entity-actions"><button onClick={()=>edit('group',g)}>Edit</button>{isSuperAdmin&&<button className="delete-entity" onClick={()=>askDelete('group',g.group_id,g.group_name)} aria-label={`Delete ${g.group_name}`}><Trash2/></button>}</div></article>})}</AdminCollection><AdminCollection title="Choices & extras" count={filteredOptions.length} emptyLabel="choices or extras for this category" description="Choices connected to the visible option groups." action="Add option" onAdd={()=>edit('option')} loading={loading}>{filteredOptions.map(o=><article className="compact-entity" key={o.option_id}><div><span>{restaurantMoney(o.price,optionRestaurantId(o))}</span><h3>{o.option_name}</h3><p>{data.optionGroups.find(g=>g.group_id===o.group_id)?.group_name||o.group_id}</p></div><div className="entity-actions"><button onClick={()=>edit('option',o)}>Edit</button>{isSuperAdmin&&<button className="delete-entity" onClick={()=>askDelete('option',o.option_id,o.option_name)} aria-label={`Delete ${o.option_name}`}><Trash2/></button>}</div></article>)}</AdminCollection></div></>}
    </section>{editor&&<Editor editor={editor} setEditor={setEditor} data={data} save={save} saving={saving}/>} {deleteTarget&&<DeleteDialog target={deleteTarget} error={deleteError} deleting={deleting} close={()=>!deleting&&setDeleteTarget(null)} submit={confirmDelete}/>} {passwordOpen&&<AdminPasswordChange session={session} onClose={()=>setPasswordOpen(false)}/>}</main>;
}
function OrderDetails({order}){return <div className="admin-order-details"><div className="order-detail-section"><h3>Items & add-ons</h3>{(order.items||[]).map((item,index)=><div className="detailed-item" key={`${item.item_id}-${index}`}><span>{item.quantity}×</span><div><strong>{item.name}</strong>{item.selected_options?.length?<ul>{item.selected_options.map((option,i)=><li key={`${option.option_id}-${i}`}>{option.option_name}{Number(option.price)>0?` (+${money(option.price)})`:''}</li>)}</ul>:<small>No add-ons</small>}{item.remarks&&<p><b>Item remark:</b> {item.remarks}</p>}</div><b>{money(item.total_price)}</b></div>)}</div><div className="order-detail-section"><h3>Customer & address</h3><p><strong>{order.customer_name}</strong><br/>{order.contact_number}<br/>{order.house_number}, {order.barangay}, {order.city}</p>{order.landmark&&<p><b>Landmark:</b> {order.landmark}</p>}</div><div className="order-detail-section"><h3>Payment summary</h3><p><b>Fulfillment:</b> {order.fulfillment_type==='pickup'?'Pickup':'Doorstep'}<br/><b>Subtotal:</b> {money(order.subtotal)}<br/><b>Delivery fee:</b> {order.delivery_provider==='lalamove'?'Lalamove quote':money(order.delivery_fee||0)}<br/><strong>Total: {money(order.order_total??order.subtotal)}</strong></p></div><div className="order-detail-section"><h3>Order remarks</h3><p>{order.order_remarks||'No order remarks.'}</p></div></div>}
function AdminLoading(){return <div className="admin-loading"><Loader2 className="spin"/> Loading live data…</div>}
function AdminCollection({title,count,emptyLabel,description,action,onAdd,loading,children}){return <div className="admin-panel"><div className="admin-panel-head"><div><div className="title-with-count"><h2>{title}</h2>{Number.isFinite(count)&&<span>{count}</span>}</div><p>{description}</p></div><button className="admin-add" onClick={onAdd}><Plus/> {action}</button></div>{loading?<AdminLoading/>:count===0?<CollectionEmpty label={emptyLabel}/>:<div className="entity-grid">{children}</div>}</div>}
function CollectionEmpty({label}){return <div className="collection-empty"><Layers3/><strong>No {label} yet</strong><span>Create the first one using the button above.</span></div>}
function DeleteDialog({target,error,deleting,close,submit}) {
  const isGroup=target.type==='group';
  return <div className="admin-modal-bg delete-modal-bg" onMouseDown={event=>event.target===event.currentTarget&&close()}><section className="admin-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><header><div><p className="kicker">Super Admin only</p><h2 id="delete-title">Delete {isGroup?'add-on group':'choice or extra'}?</h2></div><button onClick={close} disabled={deleting} aria-label="Close"><X/></button></header><form onSubmit={submit}><div className="delete-modal-body"><span className="delete-warning-icon"><Trash2/></span><p>You are about to permanently delete <strong>{target.name}</strong>.</p>{isGroup&&<p className="delete-cascade-note">All choices and extras inside this group will also be deleted.</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div><footer><button type="button" className="secondary-button" onClick={close} disabled={deleting}>Cancel</button><button className="danger-button" disabled={deleting}>{deleting?<Loader2 className="spin"/>:<Trash2/>}{deleting?'Deleting…':'Delete permanently'}</button></footer></form></section></div>;
}
function Editor({editor,setEditor,data,save,saving}) {
  const { type, record } = editor;
  const idFields = { restaurant:'restaurant_id', category:'category_id', menu:'item_id', group:'group_id', option:'option_id', account:'user_id', delivery:'market_code' };
  const set = (key,value) => setEditor({...editor,record:{...record,[key]:value}});
  const selectedGroup=type==='option'?data.optionGroups.find(group=>String(group.group_id)===String(record.group_id)):null;
  const selectedGroupItem=selectedGroup?.item_id?data.menuItems.find(item=>String(item.item_id)===String(selectedGroup.item_id)):null;
  const selectedGroupCategory=data.categories.find(category=>String(category.category_id)===String(selectedGroup?.category_id||selectedGroupItem?.category_id));
  const priceRestaurantId=type==='menu'?record.restaurant_id:selectedGroupItem?.restaurant_id||selectedGroupCategory?.restaurant_id;
  const priceMarketCode=data.restaurants.find(restaurant=>String(restaurant.restaurant_id)===String(priceRestaurantId))?.market_code||DEFAULT_DEPLOYMENT_MARKET;
  const priceSymbol=priceMarketCode.startsWith('gh-')?'GH₵':'₱';
  const configs = {
    restaurant:[['market_code','Market','market'],['timezone','Local timezone','timezone'],['name','Restaurant name','text'],['address','Restaurant address','text'],['latitude','Latitude','number'],['longitude','Longitude','number'],['delivery_radius_km','Delivery radius (km)','number'],['sort_order','Storefront position (1 comes first)','number'],['logo_url','Logo URL (restaurant cards)','url'],['banner_url','Banner URL (restaurant page cover)','url'],['description','Description','textarea'],['active','Storefront visibility','active'],['orders_paused','Temporarily pause orders','boolean'],['pause_message','Pause message','text']],
    category:[['restaurant_id','Restaurant','restaurant'],['name','Category name','text'],['active','Status','active'],['sort_order','Sort order','number']],
    menu:[['restaurant_id','Restaurant','restaurant'],['category_id','Category','category'],['name','Item name','text'],['description','Item description','textarea'],['base_price',`Base price (${priceSymbol})`,'number'],['photo_url','Photo URL','url'],['active','Status','active'],['sort_order','Position in category (1 comes first)','number']],
    group:[['scope','Available for','scope'],['scope_category_id','Category','scopeCategory'],['item_id','Only this menu item','item'],['group_name','Group name','text'],['selection_type','Selection type','selection'],['required','Required','yesno'],['sort_order','Sort order','number']],
    option:[['group_id','Option group','group'],['option_name','Option name','text'],['price',`Additional price (${priceSymbol})`,'number'],['sort_order','Sort order','number']],
    account:[['display_name','Display name','text'],['username','Username','accountUsername'],['password',record.user_id?'New password (optional)':'Temporary password','accountPassword'],['role','Account role','role'],['active','Account status','accountActive']],
    delivery:[['base_distance_km','Base distance including grace buffer (km)','number'],['base_fare','Base fare','number'],['additional_per_km','Additional charge per kilometer block','number'],['max_internal_distance_km','Maximum internal fleet distance (km)','number'],['peak_surcharge','Peak surcharge','number'],['lunch_peak_start','Lunch peak starts','time'],['lunch_peak_end','Lunch peak ends','time'],['dinner_peak_start','Dinner peak starts','time'],['dinner_peak_end','Dinner peak ends','time'],['storm_surcharge','Storm surcharge','number'],['storm_active','Storm surcharge status','boolean'],['active','Delivery fee calculation','boolean']]
  };
  const categories = type === 'menu' && record.restaurant_id ? data.categories.filter(c => String(c.restaurant_id) === String(record.restaurant_id) && c.active === 'yes') : data.categories;
  const scopedItems = data.menuItems.filter(item => String(item.category_id) === String(record.scope_category_id));
  const renderField = ([key,label,kind]) => {
    if (kind === 'item' && record.scope !== 'item') return null;
    return <label key={key}><span>{label}</span>{
    kind==='textarea'?<textarea value={record[key]||''} onChange={e=>set(key,e.target.value)}/>:
    kind==='accountUsername'?<input value={record[key]||''} onChange={e=>set(key,e.target.value)} disabled={Boolean(record.user_id)} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" required/>:
    kind==='accountPassword'?<input type="password" minLength={8} value={record[key]||''} onChange={e=>set(key,e.target.value)} autoComplete="new-password" required={!record.user_id} placeholder={record.user_id?'Leave blank to keep current password':'At least 8 characters'}/>:
    kind==='role'?<select value={record[key]||'inventory'} onChange={e=>set(key,e.target.value)}><option value="inventory">Inventory</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select>:
    kind==='accountActive'?<select value={String(record[key]!==false)} onChange={e=>set(key,e.target.value==='true')}><option value="true">Active</option><option value="false">Disabled</option></select>:
    kind==='boolean'?<select value={String(record[key]===true||record[key]==='true')} onChange={e=>set(key,e.target.value==='true')}><option value="true">Enabled</option><option value="false">Disabled</option></select>:
    kind==='market'?<select value={record[key]||DEFAULT_DEPLOYMENT_MARKET} onChange={e=>{const marketCode=e.target.value;setEditor({...editor,record:{...record,[key]:marketCode,...(type==='restaurant'?{timezone:marketTimezone(marketCode)}:{})}});}}>{MARKET_OPTIONS.map(market=><option value={market.code} key={market.code}>{market.label}</option>)}</select>:
    kind==='timezone'?<select value={record[key]||marketTimezone(record.market_code)} onChange={e=>set(key,e.target.value)}><option value="Asia/Manila">Asia/Manila</option><option value="Africa/Accra">Africa/Accra</option></select>:
    kind==='restaurant'?<select value={record[key]} onChange={e=>{const restaurantId=e.target.value;const nextCategory=type==='menu'?data.categories.find(category=>String(category.restaurant_id)===String(restaurantId)&&category.active==='yes')?.category_id||'':record.category_id;setEditor({...editor,record:{...record,restaurant_id:restaurantId,category_id:nextCategory}});}}>{data.restaurants.map(x=><option value={x.restaurant_id} key={x.restaurant_id}>{x.name}</option>)}</select>:
    kind==='category'?<select value={record[key]} onChange={e=>set(key,e.target.value)} required><option value="" disabled>Select a category</option>{categories.map(x=><option value={x.category_id} key={x.category_id}>{x.name}</option>)}</select>:
    kind==='scope'?<select value={record.scope} onChange={e=>{const scope=e.target.value;const categoryId=record.scope_category_id||data.categories[0]?.category_id||'';const firstItem=data.menuItems.find(item=>String(item.category_id)===String(categoryId))?.item_id||'';setEditor({...editor,record:{...record,scope,category_id:scope==='category'?categoryId:'',item_id:scope==='item'?firstItem:''}});}}><option value="category">Every menu item in a category</option><option value="item">One specific menu item only</option></select>:
    kind==='scopeCategory'?<select value={record.scope_category_id||''} onChange={e=>{const categoryId=e.target.value;const firstItem=data.menuItems.find(item=>String(item.category_id)===String(categoryId))?.item_id||'';setEditor({...editor,record:{...record,scope_category_id:categoryId,category_id:record.scope==='category'?categoryId:'',item_id:record.scope==='item'?firstItem:''}});}} required><option value="" disabled>Select a category</option>{data.categories.map(x=><option value={x.category_id} key={x.category_id}>{x.name}</option>)}</select>:
    kind==='item'?<select value={record.item_id||''} onChange={e=>set(key,e.target.value)} required><option value="" disabled>{scopedItems.length?'Select a menu item':'No menu items in this category'}</option>{scopedItems.map(x=><option value={x.item_id} key={x.item_id}>{x.name}</option>)}</select>:
    kind==='group'?<select value={record[key]} onChange={e=>set(key,e.target.value)}>{data.optionGroups.map(x=><option value={x.group_id} key={x.group_id}>{x.group_name}</option>)}</select>:
    kind==='active'?<select value={record[key]} onChange={e=>set(key,e.target.value)}><option value="yes">Active</option><option value="no">Hidden</option></select>:
    kind==='selection'?<select value={record[key]} onChange={e=>set(key,e.target.value)}><option value="single">Single choice</option><option value="multiple">Multiple choice</option></select>:
    kind==='yesno'?<select value={record[key]} onChange={e=>set(key,e.target.value)}><option value="yes">Yes</option><option value="no">No</option></select>:
    <input type={kind} step={kind==='number'?'any':undefined} value={record[key]??''} onChange={e=>set(key,e.target.value)} required={!['logo_url','banner_url','photo_url','description'].includes(key)}/>
  }</label>;
  };
  const setHours=(day,key,value)=>set('weekly_hours',{...(record.weekly_hours||DEFAULT_WEEKLY_HOURS),[day]:{...(record.weekly_hours?.[day]||DEFAULT_WEEKLY_HOURS[day]),[key]:value}});
  return <div className="admin-modal-bg"><section className="admin-modal"><header><div><p className="kicker">{record[idFields[type]]?'Edit':'Create'}</p><h2>{type==='group'?'Option group':type==='account'?'Staff account':type}</h2></div><button onClick={()=>setEditor(null)}><X/></button></header><div className="admin-form">{configs[type].map(renderField)}{type==='restaurant'&&<div className="weekly-hours-editor"><div><strong>Weekly operating hours</strong><small>Times use {record.timezone||marketTimezone(record.market_code)}. Enable a break to close between two shifts.</small></div>{RESTAURANT_DAYS.map(day=>{
    const hours=record.weekly_hours?.[day.key]||DEFAULT_WEEKLY_HOURS[day.key];
    return <div className="hours-row" key={day.key}>
      <strong>{day.short}</strong>
      <label className="open-toggle"><input type="checkbox" checked={!hours.closed} onChange={event=>setHours(day.key,'closed',!event.target.checked)}/> Open</label>
      <input type="time" value={hours.open} disabled={hours.closed} onChange={event=>setHours(day.key,'open',event.target.value)}/><span>to</span><input type="time" value={hours.close} disabled={hours.closed} onChange={event=>setHours(day.key,'close',event.target.value)}/>
      <label className="break-toggle"><input type="checkbox" checked={Boolean(hours.break_enabled)} disabled={hours.closed} onChange={event=>setHours(day.key,'break_enabled',event.target.checked)}/> Has break</label>
      {hours.break_enabled&&!hours.closed&&<div className="break-hours"><input type="time" value={hours.break_start||'12:00'} aria-label={`${day.label} break starts`} onChange={event=>setHours(day.key,'break_start',event.target.value)}/><span>to</span><input type="time" value={hours.break_end||'13:00'} aria-label={`${day.label} break ends`} onChange={event=>setHours(day.key,'break_end',event.target.value)}/></div>}
    </div>;
  })}</div>}</div><footer><button className="secondary-button" onClick={()=>setEditor(null)}>Cancel</button><button className="primary-button" onClick={save} disabled={saving}>{saving?<Loader2 className="spin"/>:<Save/>} Save changes</button></footer></section></div>;
}
