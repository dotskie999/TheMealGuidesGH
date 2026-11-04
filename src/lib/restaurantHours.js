const DAYS=[
  {key:'0',short:'Sun',label:'Sunday'}, {key:'1',short:'Mon',label:'Monday'},
  {key:'2',short:'Tue',label:'Tuesday'}, {key:'3',short:'Wed',label:'Wednesday'},
  {key:'4',short:'Thu',label:'Thursday'}, {key:'5',short:'Fri',label:'Friday'},
  {key:'6',short:'Sat',label:'Saturday'},
];

export const RESTAURANT_DAYS=DAYS;
export const DEFAULT_WEEKLY_HOURS=Object.fromEntries(DAYS.map(day=>[day.key,{closed:false,open:'09:00',close:'22:00',break_enabled:false,break_start:'12:00',break_end:'13:00'}]));
export const marketTimezone=(marketCode)=>String(marketCode||'').startsWith('gh-')?'Africa/Accra':'Asia/Manila';

const validTime=(value)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
const minutes=(value)=>{const [hour,minute]=String(value).split(':').map(Number);return hour*60+minute;};
const clock=(value)=>{if(!validTime(value))return '';const [hour,minute]=value.split(':').map(Number);return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`;};

export function normalizeWeeklyHours(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return Object.fromEntries(DAYS.map(day=>{
    const row=source[day.key]||{};
    return [day.key,{
      closed:row.closed===true||row.closed==='true',
      open:validTime(row.open)?row.open:'09:00',
      close:validTime(row.close)?row.close:'22:00',
      break_enabled:row.break_enabled===true||row.break_enabled==='true',
      break_start:validTime(row.break_start)?row.break_start:'12:00',
      break_end:validTime(row.break_end)?row.break_end:'13:00',
    }];
  }));
}

function shiftBounds(row,base=0){
  const openMinute=minutes(row.open); const closeMinute=minutes(row.close);
  return {start:base+openMinute,end:base+closeMinute+(closeMinute<=openMinute?1440:0)};
}

function breakBounds(row,base=0){
  if(row.closed||!row.break_enabled) return null;
  const shift=shiftBounds(row,base);
  let start=base+minutes(row.break_start); while(start<=shift.start) start+=1440;
  let end=base+minutes(row.break_end); while(end<=start) end+=1440;
  return start<shift.end&&end<shift.end?{start,end}:null;
}

export function validateWeeklyHours(value){
  const schedule=normalizeWeeklyHours(value);
  for(const day of DAYS){
    const row=schedule[day.key];
    if(!row.closed&&row.break_enabled&&!breakBounds(row)) return `${day.label} break must start after opening and finish before closing.`;
  }
  return '';
}

function localParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(type)=>parts.find(part=>part.type===type)?.value;
  return {day:DAYS.findIndex(entry=>entry.short===get('weekday')),minute:Number(get('hour'))*60+Number(get('minute'))};
}

export function restaurantAvailability(restaurant,date=new Date()){
  if(restaurant?.orders_paused===true||restaurant?.orders_paused==='true') return {isOpen:false,paused:true,label:'Orders paused',detail:restaurant.pause_message||'This kitchen is temporarily not accepting orders.'};
  if(!restaurant?.weekly_hours) return {isOpen:true,configured:false,label:'Open now',detail:'Operating hours are not configured yet.'};
  const timeZone=restaurant.timezone||marketTimezone(restaurant.market_code);
  const schedule=normalizeWeeklyHours(restaurant.weekly_hours);
  const local=localParts(date,timeZone); const segments=[]; const breaks=[];
  for(let offset=-1;offset<8;offset+=1){
    const dayIndex=(local.day+offset+7)%7; const row=schedule[String(dayIndex)];
    if(row.closed) continue;
    const base=offset*1440; const shift=shiftBounds(row,base); const pause=breakBounds(row,base);
    if(pause){
      segments.push({start:shift.start,end:pause.start,startTime:row.open,endTime:row.break_start,endReason:'break',reopenTime:row.break_end});
      segments.push({start:pause.end,end:shift.end,startTime:row.break_end,endTime:row.close,endReason:'close'});
      breaks.push({start:pause.start,end:pause.end,reopenTime:row.break_end});
    }else segments.push({start:shift.start,end:shift.end,startTime:row.open,endTime:row.close,endReason:'close'});
  }
  segments.sort((a,b)=>a.start-b.start); breaks.sort((a,b)=>a.start-b.start);
  const current=segments.find(segment=>segment.start<=local.minute&&local.minute<segment.end);
  if(current){
    const remaining=current.end-local.minute;
    if(current.endReason==='break') return {isOpen:true,configured:true,label:remaining<=60?`Break starts soon · ${remaining} min`:'Open now',detail:`Break at ${clock(current.endTime)} · Reopens at ${clock(current.reopenTime)}`,timeZone};
    return {isOpen:true,configured:true,label:remaining<=60?`Closing soon · ${remaining} min`:'Open now',detail:`Closes at ${clock(current.endTime)}`,timeZone};
  }
  const currentBreak=breaks.find(pause=>pause.start<=local.minute&&local.minute<pause.end);
  if(currentBreak){
    const offset=Math.floor(currentBreak.end/1440); const dayIndex=(local.day+offset+7)%7;
    return {isOpen:false,onBreak:true,configured:true,label:'On break',detail:`Reopens ${offset===0?'today':offset===1?'tomorrow':DAYS[dayIndex].label} at ${clock(currentBreak.reopenTime)}`,timeZone};
  }
  const next=segments.find(segment=>segment.start>local.minute);
  if(next){
    const offset=Math.floor(next.start/1440); const dayIndex=(local.day+offset+7)%7;
    return {isOpen:false,configured:true,label:'Closed',detail:`Opens ${offset===0?'today':offset===1?'tomorrow':DAYS[dayIndex].label} at ${clock(next.startTime)}`,timeZone};
  }
  return {isOpen:false,configured:true,label:'Closed',detail:'No upcoming opening time is configured.',timeZone};
}
