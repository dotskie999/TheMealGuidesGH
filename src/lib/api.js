import 'server-only';

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMarket, isWithinMarketArea } from '@/lib/markets';
import { marketTimezone, normalizeWeeklyHours, restaurantAvailability, validateWeeklyHours } from '@/lib/restaurantHours';
import { assertServerMarket, serverDefaultMarket, serverMarketCodes } from '@/lib/deploymentServer';

const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

function databaseError(error, context) {
  console.error(`Supabase ${context} error:`, error?.message || error);
  return new Error(`The database could not ${context}.`);
}

function missingColumn(error, column) {
  return error?.code === 'PGRST204' && String(error.message || '').includes(`'${column}'`);
}

function cleanRecord(record = {}) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value === '' || value === undefined ? null : value]),
  );
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function bySortOrder(a, b) {
  return Number(a.sort_order || 0) - Number(b.sort_order || 0);
}

function sameId(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

async function selectAll(table) {
  const { data, error } = await supabaseAdmin.from(table).select('*');
  if (error) throw databaseError(error, `read ${table}`);
  return data || [];
}

async function scopedRestaurant(restaurantId, activeOnly=false) {
  let query=supabaseAdmin.from('restaurants').select('*').eq('restaurant_id',restaurantId).in('market_code',serverMarketCodes());
  if(activeOnly) query=query.eq('active','yes');
  const {data,error}=await query.maybeSingle();
  if(error) throw databaseError(error,'load restaurant');
  if(!data) throw new Error('Restaurant not found in this deployment.');
  return data;
}

async function scopedRows(table, column, values) {
  if(!values.length) return [];
  const {data,error}=await supabaseAdmin.from(table).select('*').in(column,values);
  if(error) throw databaseError(error,`read ${table}`);
  return data||[];
}

export async function getRestaurants() {
  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .select('*')
    .eq('active', 'yes')
    .in('market_code',serverMarketCodes())
    .order('name');
  if (error) throw databaseError(error, 'load restaurants');
  return data || [];
}

export async function getMenu(restaurantId) {
  if (!restaurantId) throw new Error('A restaurant is required.');

  const [restaurantResult, categoriesResult, itemsResult, groupsResult, optionsResult] = await Promise.all([
    supabaseAdmin.from('restaurants').select('*').eq('restaurant_id', restaurantId).eq('active', 'yes').in('market_code',serverMarketCodes()).maybeSingle(),
    supabaseAdmin.from('categories').select('*').eq('restaurant_id', restaurantId).eq('active', 'yes').order('sort_order').order('name'),
    supabaseAdmin.from('menu_items').select('*').eq('restaurant_id', restaurantId).eq('active', 'yes'),
    supabaseAdmin.from('option_groups').select('*').order('sort_order'),
    supabaseAdmin.from('options').select('*').order('sort_order'),
  ]);

  for (const [result, label] of [
    [restaurantResult, 'load restaurant'],
    [categoriesResult, 'load categories'],
    [itemsResult, 'load menu items'],
    [groupsResult, 'load option groups'],
    [optionsResult, 'load options'],
  ]) {
    if (result.error) throw databaseError(result.error, label);
  }

  if (!restaurantResult.data) throw new Error('Restaurant not found.');

  const optionsByGroup = new Map();
  for (const option of optionsResult.data || []) {
    const options = optionsByGroup.get(option.group_id) || [];
    options.push(option);
    optionsByGroup.set(option.group_id, options);
  }

  const groups = groupsResult.data || [];
  const categoryOrder = new Map((categoriesResult.data || []).map((category, index) => [String(category.category_id), index]));
  const menuItems = (itemsResult.data || [])
    .sort((a, b) => (categoryOrder.get(String(a.category_id)) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(String(b.category_id)) ?? Number.MAX_SAFE_INTEGER)
      || bySortOrder(a, b)
      || String(a.name || '').localeCompare(String(b.name || '')))
    .map((item) => ({
    ...item,
    option_groups: groups
      .filter((group) => group.item_id
        ? sameId(group.item_id, item.item_id)
        : sameId(group.category_id, item.category_id))
      .sort(bySortOrder)
      .map((group) => ({ ...group, options: optionsByGroup.get(group.group_id) || [] })),
  }));

  return menuItems;
}

export async function getOrders(status) {
  let query = supabaseAdmin.from('orders').select('*').in('market_code',serverMarketCodes()).order('timestamp', { ascending: false });
  if (status && status !== 'All') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw databaseError(error, 'load orders');
  return (data || []).map(({ items_json, timestamp, ...order }) => ({
    ...order,
    created_at: timestamp,
    items: items_json || [],
  }));
}

export async function getAdminData() {
  const {data:restaurants,error:restaurantError}=await supabaseAdmin.from('restaurants').select('*').in('market_code',serverMarketCodes());
  if(restaurantError) throw databaseError(restaurantError,'load admin restaurants');
  const restaurantIds=(restaurants||[]).map(row=>row.restaurant_id);
  const [categories,menuItems,allGroups,allOptions,guests]=await Promise.all([
    scopedRows('categories','restaurant_id',restaurantIds),
    scopedRows('menu_items','restaurant_id',restaurantIds),
    selectAll('option_groups'),
    selectAll('options'),
    getGuests(),
  ]);
  const categoryIds=new Set(categories.map(row=>String(row.category_id)));
  const itemIds=new Set(menuItems.map(row=>String(row.item_id)));
  const optionGroups=allGroups.filter(row=>row.item_id?itemIds.has(String(row.item_id)):categoryIds.has(String(row.category_id)));
  const groupIds=new Set(optionGroups.map(row=>String(row.group_id)));
  const options=allOptions.filter(row=>groupIds.has(String(row.group_id)));
  return { restaurants, categories, menuItems, optionGroups, options, guests };
}

export async function getAdminSnapshot() {
  const [data, orders] = await Promise.all([getAdminData(), getOrders()]);
  return { ...data, orders };
}

function validatedQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error('Each item quantity must be between 1 and 99.');
  }
  return quantity;
}

async function buildOrderItems(restaurantId, requestedItems) {
  const menu = await getMenu(restaurantId);
  const itemMap = new Map(menu.map((item) => [item.item_id, item]));

  return requestedItems.map((requested) => {
    const item = itemMap.get(requested.item_id);
    if (!item) throw new Error('One of the selected menu items is unavailable.');
    const quantity = validatedQuantity(requested.quantity ?? requested.qty);
    const selectedIds = new Set(
      (requested.options || requested.selected_options || []).map((option) =>
        typeof option === 'string' ? option : option.option_id,
      ),
    );
    const selectedOptions = [];

    for (const group of item.option_groups || []) {
      const groupOptions = group.options || [];
      const selectedForGroup = groupOptions.filter((option) => selectedIds.has(option.option_id));
      if (group.required === 'yes' && selectedForGroup.length === 0) {
        throw new Error(`Please select an option for ${group.group_name}.`);
      }
      if (group.selection_type === 'single' && selectedForGroup.length > 1) {
        throw new Error(`Only one option can be selected for ${group.group_name}.`);
      }
      selectedOptions.push(...selectedForGroup.map((option) => ({
        option_id: option.option_id,
        option_name: option.option_name,
        price: Number(option.price || 0),
      })));
    }

    if (selectedOptions.length !== selectedIds.size) {
      throw new Error('One of the selected options is unavailable for this item.');
    }

    const unitPrice = Number(item.base_price || 0)
      + selectedOptions.reduce((sum, option) => sum + option.price, 0);
    return {
      item_id: item.item_id,
      name: item.name,
      quantity,
      base_price: Number(item.base_price || 0),
      selected_options: selectedOptions,
      remarks: String(requested.remarks || '').trim(),
      unit_price: unitPrice,
      total_price: unitPrice * quantity,
    };
  });
}

export async function submitOrder(payload = {}) {
  const restaurantId = payload.restaurant_id;
  const requestedItems = payload.items;
  if (!restaurantId || !Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new Error('The order must contain at least one menu item.');
  }

  const restaurantLocation=await scopedRestaurant(restaurantId,true);
  const marketCode=assertServerMarket(restaurantLocation.market_code);
  if(payload.market_code&&assertServerMarket(payload.market_code)!==marketCode) throw new Error('This order belongs to a different deployment market.');
  const market = getMarket(marketCode);
  const fulfillmentType=payload.fulfillment_type==='pickup'?'pickup':'doorstep';
  let deliveryLatitude = payload.latitude === null || payload.latitude === undefined ? null : Number(payload.latitude);
  let deliveryLongitude = payload.longitude === null || payload.longitude === undefined ? null : Number(payload.longitude);
  const pinnedAddress=String(payload.formatted_address||'').trim();
  const city=String(payload.city||market.region).trim();
  const barangay=String(payload.barangay||(city||'Pinned location')).trim();
  const houseNumber=String(payload.house_number||(pinnedAddress||'Map pin')).trim();

  for (const field of ['customer_name', 'contact_number']) {
    if (!String(payload[field] || '').trim()) throw new Error('Please complete all required customer details.');
  }
  if(!city||!barangay||!houseNumber) throw new Error('Please complete all required customer details.');
  if(fulfillmentType==='doorstep'&&(payload.location_source!=='map_pin'||!pinnedAddress||!Number.isFinite(deliveryLatitude)||!Number.isFinite(deliveryLongitude))){
    throw new Error('Confirm the exact Greater Accra delivery pin before placing the order.');
  }

  const items = await buildOrderItems(restaurantId, requestedItems);
  const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
  if(fulfillmentType==='doorstep'&&Number.isFinite(deliveryLatitude)&&Number.isFinite(deliveryLongitude)&&!isWithinMarketArea(marketCode,deliveryLatitude,deliveryLongitude)){
    throw new Error(`This delivery point is outside our current ${market.region} service area.`);
  }
  const availability=restaurantAvailability(restaurantLocation);
  if(!availability.isOpen) throw new Error(`${restaurantLocation.name||'This restaurant'} is currently closed. ${availability.detail}`);
  const deliveryDistance=null;
  const deliveryQuote={delivery_fee:0,provider:fulfillmentType==='pickup'?'pickup':'customer',distance_km:null};
  const deliveryFee=0;
  const orderTotal=Number((subtotal+deliveryFee).toFixed(2));
  const orderRecord = {
      restaurant_id: restaurantId,
      items_json: items,
      subtotal,
      fulfillment_type:fulfillmentType,
      delivery_fee:deliveryFee,
      order_total:orderTotal,
      delivery_provider:deliveryQuote.provider,
      delivery_fee_breakdown:deliveryQuote,
      customer_name: String(payload.customer_name).trim(),
      customer_email: String(payload.customer_email || '').trim() || null,
      contact_number: String(payload.contact_number).trim(),
      city,
      barangay,
      house_number:houseNumber,
      landmark: String(payload.landmark || '').trim(),
      digital_address: String(payload.digital_address || '').trim(),
      market_code: marketCode,
      country_code: market.countryCode,
      currency_code: market.currency,
      order_remarks: String(payload.order_remarks || '').trim(),
      delivery_latitude: Number.isFinite(deliveryLatitude) ? deliveryLatitude : null,
      delivery_longitude: Number.isFinite(deliveryLongitude) ? deliveryLongitude : null,
      distance_km: deliveryDistance === null ? null : Number(deliveryDistance.toFixed(2)),
      location_source: ['address','map_pin'].includes(payload.location_source) ? payload.location_source : null,
      status: 'pending',
  };
  let orderResult = await supabaseAdmin
    .from('orders')
    .insert(orderRecord)
    .select('order_number,status,timestamp')
    .single();
  for(let attempt=0;attempt<10&&orderResult.error;attempt+=1){
    const unsupported=['delivery_fee_breakdown','delivery_provider','order_total','delivery_fee','fulfillment_type','digital_address','market_code','country_code','currency_code','location_source'].find((column)=>missingColumn(orderResult.error,column));
    if(!unsupported) break;
    delete orderRecord[unsupported];
    orderResult=await supabaseAdmin.from('orders').insert(orderRecord).select('order_number,status,timestamp').single();
  }
  if (orderResult.error) throw databaseError(orderResult.error, 'create the order');
  return { ...orderResult.data, order_number: String(orderResult.data.order_number).padStart(4, '0'), subtotal, fulfillment_type:fulfillmentType, delivery_fee:deliveryFee, order_total:orderTotal, delivery_provider:deliveryQuote.provider, delivery_fee_breakdown:deliveryQuote };
}

export async function getGuests() {
  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .in('market_code',serverMarketCodes())
    .order('visit_count', { ascending: false, nullsFirst: false })
    .order('last_visited_at', { ascending: false });
  if (error?.code === 'PGRST205' || error?.code === '42P01') return [];
  if (error) throw databaseError(error, 'load guest information');
  return data || [];
}

export async function saveGuest(payload = {}) {
  const guestId = String(payload.guest_id || '');
  const customerName = String(payload.customer_name || '').trim();
  const customerEmail = String(payload.customer_email || '').trim().toLowerCase();
  const contactNumber = String(payload.contact_number || '').replace(/\s/g, '');
  const landmark = String(payload.landmark || '').trim();
  const digitalAddress = String(payload.digital_address || '').trim();
  const marketCode = assertServerMarket(payload.market_code||serverDefaultMarket());
  const market = getMarket(marketCode);
  const pinnedAddress=String(payload.formatted_address||'').trim();
  const city = String(payload.city||market.region).trim();
  const barangay = String(payload.barangay||(city||'Pinned location')).trim();
  const houseNumber = String(payload.house_number||(pinnedAddress||'Map pin')).trim();
  const latitude = payload.latitude === null || payload.latitude === undefined ? null : Number(payload.latitude);
  const longitude = payload.longitude === null || payload.longitude === undefined ? null : Number(payload.longitude);
  const locationAccuracy = payload.location_accuracy === null || payload.location_accuracy === undefined ? null : Number(payload.location_accuracy);

  if (!/^[0-9a-f-]{36}$/i.test(guestId)) throw new Error('Invalid guest identifier.');
  if (!customerName || !city || !barangay || !houseNumber) throw new Error('Please complete all guest details.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error('Enter a valid email address.');
  const validPhone=/^\+233\d{9}$/.test(contactNumber);
  if (!validPhone) throw new Error(`Enter a valid ${market.country} contact number.`);
  if (!payload.consent_at) throw new Error('Consent is required before guest details can be saved.');
  if(payload.location_source!=='map_pin'||!pinnedAddress||!Number.isFinite(latitude)||!Number.isFinite(longitude)){
    throw new Error('Confirm the exact Greater Accra delivery pin before continuing.');
  }
  if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
    || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    throw new Error('Invalid location coordinates.');
  }
  if(latitude!==null&&longitude!==null&&!isWithinMarketArea(marketCode,latitude,longitude)){
    throw new Error(`This delivery point is outside our current ${market.region} service area.`);
  }

  const { data: existing, error: readError } = await supabaseAdmin
    .from('guests')
    .select('visit_count')
    .eq('guest_id', guestId)
    .maybeSingle();
  if (readError) throw databaseError(readError, 'find the guest');

  const guestRecord = {
      guest_id: guestId,
      customer_name: customerName,
      customer_email: customerEmail,
      contact_number: contactNumber,
      city,
      barangay,
      house_number: houseNumber,
      landmark,
      digital_address: digitalAddress,
      market_code: marketCode,
      country_code: market.countryCode,
      consent_at: payload.consent_at,
      latitude,
      longitude,
      location_accuracy: Number.isFinite(locationAccuracy) ? locationAccuracy : null,
      location_source: ['address','map_pin'].includes(payload.location_source) ? payload.location_source : null,
      last_visited_at: new Date().toISOString(),
      visit_count: Number(existing?.visit_count || 0) + (payload.track_visit === false ? 0 : 1),
  };
  let guestResult = await supabaseAdmin
    .from('guests')
    .upsert(guestRecord, { onConflict: 'guest_id' })
    .select()
    .single();
  for (let attempt = 0; attempt < 5 && guestResult.error; attempt += 1) {
    const unsupportedColumn = ['digital_address','market_code','country_code','landmark','location_source'].find((column) => missingColumn(guestResult.error, column));
    if (!unsupportedColumn) break;
    delete guestRecord[unsupportedColumn];
    guestResult = await supabaseAdmin.from('guests').upsert(guestRecord, { onConflict: 'guest_id' }).select().single();
  }
  if (guestResult.error) throw databaseError(guestResult.error, 'save guest information');
  return guestResult.data;
}

async function upsert(table, keyField, record, idPrefix) {
  const cleaned = cleanRecord(record);
  if (!cleaned[keyField]) cleaned[keyField] = newId(idPrefix);
  const { data, error } = await supabaseAdmin
    .from(table)
    .upsert(cleaned, { onConflict: keyField })
    .select()
    .single();
  if (error) throw databaseError(error, `save ${table}`);
  return data;
}

export async function saveRestaurant(record={}) {
  const cleaned={...record};
  if(cleaned.restaurant_id){
    const {data:existing,error}=await supabaseAdmin.from('restaurants').select('market_code').eq('restaurant_id',cleaned.restaurant_id).maybeSingle();
    if(error) throw databaseError(error,'find restaurant');
    if(existing) cleaned.market_code=assertServerMarket(existing.market_code);
  }
  cleaned.market_code=assertServerMarket(cleaned.market_code||serverDefaultMarket());
  cleaned.timezone=cleaned.timezone||marketTimezone(cleaned.market_code);
  if(cleaned.weekly_hours){
    const hoursError=validateWeeklyHours(cleaned.weekly_hours);
    if(hoursError) throw new Error(hoursError);
    cleaned.weekly_hours=normalizeWeeklyHours(cleaned.weekly_hours);
  }
  const result=await supabaseAdmin.from('restaurants').upsert(cleanRecord({...cleaned,restaurant_id:cleaned.restaurant_id||newId('r')}),{onConflict:'restaurant_id'}).select().single();
  if(result.error&&['PGRST204','42703'].includes(result.error.code)) throw new Error('Restaurant hours are not installed yet. Run RESTAURANT_HOURS_MIGRATION.sql in Supabase, then try again.');
  if(result.error) throw databaseError(result.error,'save restaurants');
  return result.data;
}
export async function saveCategory(record={}) {
  await scopedRestaurant(record.restaurant_id);
  if(record.category_id){
    const {data,error}=await supabaseAdmin.from('categories').select('restaurant_id').eq('category_id',record.category_id).maybeSingle();
    if(error) throw databaseError(error,'find category');
    if(data) await scopedRestaurant(data.restaurant_id);
  }
  return upsert('categories','category_id',record,'cat');
}

export async function saveMenuItem(record = {}) {
  const cleaned = cleanRecord(record);
  if(cleaned.item_id){
    const {data:existing,error:existingError}=await supabaseAdmin.from('menu_items').select('restaurant_id').eq('item_id',cleaned.item_id).maybeSingle();
    if(existingError) throw databaseError(existingError,'find menu item');
    if(existing) await scopedRestaurant(existing.restaurant_id);
  }
  if (cleaned.category_id) {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('restaurant_id,name')
      .eq('category_id', cleaned.category_id)
      .single();
    if (error) throw databaseError(error, 'find the menu category');
    await scopedRestaurant(data.restaurant_id);
    cleaned.restaurant_id = data.restaurant_id;
    cleaned.category = data.name;
  }
  return upsert('menu_items', 'item_id', cleaned, 'item');
}

export async function saveOptionGroup(record = {}) {
  const cleaned = cleanRecord(record);
  if(cleaned.group_id){
    const {data:existing,error:existingError}=await supabaseAdmin.from('option_groups').select('group_id').eq('group_id',cleaned.group_id).maybeSingle();
    if(existingError) throw databaseError(existingError,'find add-on group');
    if(existing) await assertScopedGroup(existing.group_id);
  }
  const scope = cleaned.scope === 'item' ? 'item' : 'category';
  delete cleaned.scope;
  delete cleaned.scope_category_id;
  if (scope === 'item') {
    cleaned.category_id = null;
    if (!cleaned.item_id) throw new Error('Choose the menu item that should receive this add-on group.');
    const {data:item,error}=await supabaseAdmin.from('menu_items').select('restaurant_id').eq('item_id',cleaned.item_id).single();
    if(error) throw databaseError(error,'find menu item');
    await scopedRestaurant(item.restaurant_id);
  } else {
    cleaned.item_id = null;
    if (!cleaned.category_id) throw new Error('Choose the category that should receive this add-on group.');
    const {data:category,error}=await supabaseAdmin.from('categories').select('restaurant_id').eq('category_id',cleaned.category_id).single();
    if(error) throw databaseError(error,'find category');
    await scopedRestaurant(category.restaurant_id);
  }
  return upsert('option_groups', 'group_id', cleaned, 'og');
}
async function assertScopedGroup(groupId) {
  const {data:group,error}=await supabaseAdmin.from('option_groups').select('category_id,item_id').eq('group_id',groupId).single();
  if(error) throw databaseError(error,'find add-on group');
  if(group.item_id){
    const {data:item,error:itemError}=await supabaseAdmin.from('menu_items').select('restaurant_id').eq('item_id',group.item_id).single();
    if(itemError) throw databaseError(itemError,'find menu item');
    await scopedRestaurant(item.restaurant_id);
  }else{
    const {data:category,error:categoryError}=await supabaseAdmin.from('categories').select('restaurant_id').eq('category_id',group.category_id).single();
    if(categoryError) throw databaseError(categoryError,'find category');
    await scopedRestaurant(category.restaurant_id);
  }
  return group;
}

export async function saveOption(record={}) {
  await assertScopedGroup(record.group_id);
  if(record.option_id){
    const {data,error}=await supabaseAdmin.from('options').select('group_id').eq('option_id',record.option_id).maybeSingle();
    if(error) throw databaseError(error,'find option');
    if(data) await assertScopedGroup(data.group_id);
  }
  return upsert('options','option_id',record,'opt');
}

async function deleteAdminRecord(table, keyField, id, label) {
  const recordId = String(id || '').trim();
  if (!recordId) throw new Error(`Choose the ${label} to delete.`);
  const { data, error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq(keyField, recordId)
    .select(keyField)
    .maybeSingle();
  if (error) throw databaseError(error, `delete the ${label}`);
  if (!data) throw new Error(`The ${label} no longer exists.`);
  return { deleted: true, id: recordId };
}

export async function deleteOptionGroup({id}={}) { await assertScopedGroup(id); return deleteAdminRecord('option_groups','group_id',id,'add-on group'); }
export async function deleteOption({id}={}) {
  const {data,error}=await supabaseAdmin.from('options').select('group_id').eq('option_id',id).single();
  if(error) throw databaseError(error,'find option');
  await assertScopedGroup(data.group_id);
  return deleteAdminRecord('options','option_id',id,'choice or extra');
}

export async function updateOrderStatus(orderNumber, status) {
  if (!ORDER_STATUSES.includes(status)) throw new Error('Invalid order status.');
  const numericOrderNumber = Number(orderNumber);
  if (!Number.isInteger(numericOrderNumber)) throw new Error('Invalid order number.');

  const { data: existing, error: readError } = await supabaseAdmin
    .from('orders')
    .select('status,market_code')
    .eq('order_number', numericOrderNumber)
    .in('market_code',serverMarketCodes())
    .single();
  if (readError) throw databaseError(readError, 'find the order');
  if (existing.status === 'Completed' && status !== 'Completed') {
    throw new Error('Completed orders cannot be reopened.');
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status })
    .eq('order_number', numericOrderNumber)
    .in('market_code',serverMarketCodes())
    .select()
    .single();
  if (error) throw databaseError(error, 'update order status');
  return { ...data, order_number: String(data.order_number).padStart(4, '0') };
}

export function verifyAdminPin(pin) {
  const expected = process.env.ADMIN_PIN;
  if (!expected) throw new Error('ADMIN_PIN is not configured.');
  const suppliedBuffer = Buffer.from(String(pin || ''));
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function apiRequest(action, { params = {}, body = {} } = {}) {
  const record = body.record || body;
  const actions = {
    getRestaurants: () => getRestaurants(),
    getMenu: () => getMenu(params.restaurant_id || body.restaurant_id),
    getOrders: () => getOrders(params.status || body.status),
    getAdminData: () => getAdminData(),
    getAdminSnapshot: () => getAdminSnapshot(),
    submitOrder: () => submitOrder(body),
    saveRestaurant: () => saveRestaurant(record),
    saveCategory: () => saveCategory(record),
    saveMenuItem: () => saveMenuItem(record),
    saveOptionGroup: () => saveOptionGroup(record),
    saveOption: () => saveOption(record),
    deleteOptionGroup: () => deleteOptionGroup(body),
    deleteOption: () => deleteOption(body),
    updateOrderStatus: () => updateOrderStatus(body.order_number, body.new_status || body.status),
  };
  if (!actions[action]) throw new Error(`Unsupported action: ${action}`);
  return actions[action]();
}
