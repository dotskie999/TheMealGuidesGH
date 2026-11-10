import { NextResponse } from 'next/server';
import { apiRequest } from '@/lib/api';
import { ADMIN_COOKIE } from '@/lib/adminAuth';
import { logAdminAction, resolveAdminSession } from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { adminUsernameEmail, normalizeAdminUsername, validAdminUsername } from '@/lib/adminUsername';
import { serverMarketCodes } from '@/lib/deploymentServer';

const READ_ROLES={
  getOrders:['admin','super_admin'],
  getAdminData:['inventory','admin','super_admin'],
  getAdminSnapshot:['inventory','admin','super_admin'],
  getAdminAccounts:['super_admin'],
  getAdminActivity:['super_admin'],
};
const WRITE_ROLES={
  saveRestaurant:['inventory','admin','super_admin'],
  saveCategory:['inventory','admin','super_admin'],
  saveMenuItem:['inventory','admin','super_admin'],
  saveOptionGroup:['inventory','admin','super_admin'],
  saveOption:['inventory','admin','super_admin'],
  updateOrderStatus:['admin','super_admin'],
  deleteOptionGroup:['super_admin'],
  deleteOption:['super_admin'],
  saveAdminAccount:['super_admin'],
};

const sameId=(left,right)=>String(left??'')===String(right??'');
const sessionFor=(request)=>resolveAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
const forbidden=(message='Your account does not have permission for this action.')=>NextResponse.json({error:message},{status:403});

async function restaurantFromRow(table,key,value){
  if(!value) return null;
  const {data,error}=await supabaseAdmin.from(table).select('restaurant_id').eq(key,value).maybeSingle();
  if(error) throw new Error(error.message);
  return data?.restaurant_id||null;
}

async function restaurantFromGroup(groupId){
  if(!groupId) return null;
  const {data,error}=await supabaseAdmin.from('option_groups').select('category_id,item_id').eq('group_id',groupId).maybeSingle();
  if(error) throw new Error(error.message);
  if(!data) return null;
  return data.item_id
    ? restaurantFromRow('menu_items','item_id',data.item_id)
    : restaurantFromRow('categories','category_id',data.category_id);
}

async function restaurantFromOption(optionId){
  if(!optionId) return null;
  const {data,error}=await supabaseAdmin.from('options').select('group_id').eq('option_id',optionId).maybeSingle();
  if(error) throw new Error(error.message);
  return restaurantFromGroup(data?.group_id);
}

async function actionRestaurantIds(action,body){
  const record=body.record||body;
  const ids=[];
  if(action==='saveCategory'){
    ids.push(record.restaurant_id);
    if(record.category_id) ids.push(await restaurantFromRow('categories','category_id',record.category_id));
  }else if(action==='saveMenuItem'){
    if(record.category_id) ids.push(await restaurantFromRow('categories','category_id',record.category_id));
    if(record.item_id) ids.push(await restaurantFromRow('menu_items','item_id',record.item_id));
  }else if(action==='saveOptionGroup'){
    if(record.scope==='item'||record.item_id) ids.push(await restaurantFromRow('menu_items','item_id',record.item_id));
    else ids.push(await restaurantFromRow('categories','category_id',record.category_id||record.scope_category_id));
    if(record.group_id) ids.push(await restaurantFromGroup(record.group_id));
  }else if(action==='saveOption'){
    ids.push(await restaurantFromGroup(record.group_id));
    if(record.option_id) ids.push(await restaurantFromOption(record.option_id));
  }else if(action==='deleteOptionGroup') ids.push(await restaurantFromGroup(body.id));
  else if(action==='deleteOption') ids.push(await restaurantFromOption(body.id));
  else if(action==='updateOrderStatus') ids.push(await restaurantFromRow('orders','order_number',body.order_number));
  return ids.filter(Boolean);
}

async function assertWriteScope(action,body,session){
  if(session.emergency||action==='saveAdminAccount') return;
  const record=body.record||body;
  if(action==='saveRestaurant'){
    if(!session.restaurantId) throw new Error('Emergency access must assign this account to a restaurant first.');
    if(!sameId(record.restaurant_id,session.restaurantId)) throw new Error('Your account can manage only its assigned restaurant.');
    return;
  }
  if(!session.restaurantId) throw new Error('Create your restaurant before managing menus, orders, or staff.');
  const ids=await actionRestaurantIds(action,body);
  if(!ids.length||ids.some(id=>!sameId(id,session.restaurantId))) throw new Error('Your account can manage only its assigned restaurant.');
}

function scopeAdminData(result,session){
  if(session.emergency) return result;
  const restaurantId=session.restaurantId;
  if(!restaurantId) return {...result,restaurants:[],categories:[],menuItems:[],optionGroups:[],options:[],orders:[],guests:[]};
  const restaurants=(result.restaurants||[]).filter(row=>sameId(row.restaurant_id,restaurantId));
  const categories=(result.categories||[]).filter(row=>sameId(row.restaurant_id,restaurantId));
  const menuItems=(result.menuItems||[]).filter(row=>sameId(row.restaurant_id,restaurantId));
  const categoryIds=new Set(categories.map(row=>String(row.category_id)));
  const itemIds=new Set(menuItems.map(row=>String(row.item_id)));
  const optionGroups=(result.optionGroups||[]).filter(row=>row.item_id?itemIds.has(String(row.item_id)):categoryIds.has(String(row.category_id)));
  const groupIds=new Set(optionGroups.map(row=>String(row.group_id)));
  const options=(result.options||[]).filter(row=>groupIds.has(String(row.group_id)));
  const orders=(result.orders||[]).filter(row=>sameId(row.restaurant_id,restaurantId));
  const customerKeys=new Set(orders.flatMap(row=>[row.contact_number,row.customer_email].filter(Boolean).map(value=>String(value).toLowerCase())));
  const guests=(result.guests||[]).filter(row=>
    (row.restaurant_visits||[]).some(visit=>sameId(visit.restaurant_id,restaurantId))
    || [row.contact_number,row.customer_email].some(value=>value&&customerKeys.has(String(value).toLowerCase())),
  ).map(row=>{
    const restaurantVisits=(row.restaurant_visits||[]).filter(visit=>sameId(visit.restaurant_id,restaurantId));
    return {
      ...row,
      restaurant_visits:restaurantVisits,
      restaurant_visit_count:restaurantVisits.reduce((total,visit)=>total+Number(visit.visit_count||0),0),
      restaurant_last_visited_at:restaurantVisits[0]?.last_visited_at||null,
    };
  });
  return {...result,restaurants,categories,menuItems,optionGroups,options,orders,guests};
}

async function listAdminAccounts(session){
  let query=supabaseAdmin.from('admin_profiles').select('user_id,username,display_name,role,active,must_change_password,country_scope,restaurant_id,created_at,updated_at').eq('country_scope',session.countryScope);
  if(!session.emergency) query=session.restaurantId?query.eq('restaurant_id',session.restaurantId):query.eq('user_id',session.userId);
  const {data,error}=await query.order('display_name');
  if(error&&['42P01','PGRST205'].includes(error.code)) return [];
  if(error) throw new Error(error.message);
  return data||[];
}

async function listAdminActivity(session){
  let query=supabaseAdmin.from('admin_activity_logs').select('*').eq('country_scope',session.countryScope);
  if(!session.emergency) query=session.restaurantId?query.eq('restaurant_id',session.restaurantId):query.eq('actor_user_id',session.userId);
  const {data,error}=await query.order('created_at',{ascending:false}).limit(100);
  if(error&&['42P01','PGRST205'].includes(error.code)) return [];
  if(error) throw new Error(error.message);
  return data||[];
}

async function saveAdminAccount(record,session){
  const role=String(record.role||'');
  const active=record.active===true||record.active==='true'||record.active==='yes';
  const displayName=String(record.display_name||'').trim();
  const username=normalizeAdminUsername(record.username);
  if(!displayName||!validAdminUsername(username)||!['inventory','admin','super_admin'].includes(role)) throw new Error('Use a 3–32 character username containing only letters, numbers, dots, dashes, or underscores.');
  if(!session.emergency&&!session.restaurantId) throw new Error('Emergency access must assign this account to a restaurant first.');
  const assignedRestaurantId=session.emergency?String(record.restaurant_id||'').trim():session.restaurantId;
  if(!assignedRestaurantId) throw new Error('Choose the restaurant this account will manage.');
  const {data:assignedRestaurant,error:assignedRestaurantError}=await supabaseAdmin.from('restaurants').select('restaurant_id').eq('restaurant_id',assignedRestaurantId).in('market_code',serverMarketCodes()).maybeSingle();
  if(assignedRestaurantError) throw new Error(assignedRestaurantError.message);
  if(!assignedRestaurant) throw new Error('Choose a valid Ghana restaurant for this account.');
  if(record.user_id){
    const password=String(record.password||'');
    if(password&&password.length<8) throw new Error('New password must contain at least 8 characters.');
    if(String(record.user_id)===String(session.userId)&&(!active||role!=='super_admin')) throw new Error('You cannot disable or demote your own Super Admin account.');
    const {data:existing,error:existingError}=await supabaseAdmin.from('admin_profiles').select('country_scope,restaurant_id').eq('user_id',record.user_id).eq('country_scope',session.countryScope).maybeSingle();
    if(existingError) throw new Error(existingError.message);
    if(!existing||(!session.emergency&&!sameId(existing.restaurant_id,session.restaurantId))) throw new Error('This staff account belongs to another restaurant.');
    const profileUpdate={display_name:displayName,role,active,updated_at:new Date().toISOString(),...(session.emergency?{restaurant_id:assignedRestaurantId}:{})};
    if(password) profileUpdate.must_change_password=true;
    const {data,error}=await supabaseAdmin.from('admin_profiles').update(profileUpdate).eq('user_id',record.user_id).eq('country_scope',session.countryScope).select().single();
    if(error) throw new Error(error.message);
    if(password){const {error:passwordError}=await supabaseAdmin.auth.admin.updateUserById(record.user_id,{password});if(passwordError) throw new Error(passwordError.message);}
    return data;
  }
  const password=String(record.password||'');
  if(password.length<8) throw new Error('Temporary password must contain at least 8 characters.');
  const email=adminUsernameEmail(username);
  const {data:created,error:authError}=await supabaseAdmin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:displayName,username}});
  if(authError||!created.user) throw new Error(authError?.message||'Could not create the staff login.');
  const {data,error}=await supabaseAdmin.from('admin_profiles').insert({user_id:created.user.id,email,username,display_name:displayName,role,active:true,must_change_password:true,country_scope:session.countryScope,restaurant_id:assignedRestaurantId,created_by:session.userId}).select().single();
  if(error){await supabaseAdmin.auth.admin.deleteUser(created.user.id);throw new Error(error.message);}
  return data;
}

export async function GET(request){
  const session=await sessionFor(request);
  if(!session) return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  const {searchParams}=new URL(request.url);
  const action=searchParams.get('action')||'getOrders';
  if(!READ_ROLES[action]) return NextResponse.json({error:'Unsupported admin read action.'},{status:400});
  if(!READ_ROLES[action].includes(session.role)) return forbidden();
  try{
    if(action==='getAdminAccounts') return NextResponse.json(await listAdminAccounts(session));
    if(action==='getAdminActivity') return NextResponse.json(await listAdminActivity(session));
    const params=Object.fromEntries(searchParams.entries());delete params.action;
    let result=await apiRequest(action,{params});
    if(action==='getOrders'&&!session.emergency) result=(result||[]).filter(row=>sameId(row.restaurant_id,session.restaurantId));
    else if(['getAdminData','getAdminSnapshot'].includes(action)) result=scopeAdminData(result,session);
    if(session.role==='inventory') result=action==='getAdminSnapshot'?{...result,orders:[],guests:[]}:action==='getAdminData'?{...result,guests:[]}:result;
    if(action==='getAdminSnapshot'&&session.role==='super_admin') result={...result,adminAccounts:await listAdminAccounts(session)};
    return NextResponse.json(result);
  }catch(error){return NextResponse.json({error:error.message},{status:500});}
}

export async function POST(request){
  const session=await sessionFor(request);
  if(!session) return NextResponse.json({error:'Admin sign-in required.'},{status:401});
  try{
    const {action,...body}=await request.json();
    if(!action) throw new Error('Admin action is required.');
    if(!WRITE_ROLES[action]) return NextResponse.json({error:'Unsupported admin write action.'},{status:400});
    if(!WRITE_ROLES[action].includes(session.role)) return forbidden('Only a Super Admin can delete records or manage staff accounts.');
    await assertWriteScope(action,body,session);
    const result=action==='saveAdminAccount'?await saveAdminAccount(body.record||body,session):await apiRequest(action,{method:'POST',body});
    const target=body.record||body;
    await logAdminAction(session,action,action==='saveAdminAccount'?'admin_account':action,target.user_id||target.restaurant_id||target.category_id||target.item_id||target.group_id||target.option_id||target.id||target.order_number,{});
    return NextResponse.json(result);
  }catch(error){return NextResponse.json({error:error.message},{status:500});}
}
