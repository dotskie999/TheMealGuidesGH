import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminPin } from '@/lib/api';
import { ADMIN_COOKIE, adminCookieOptions, createAdminToken } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logAdminAction, resolveAdminSession } from '@/lib/adminAccess';
import { adminUsernameEmail, normalizeAdminUsername, validAdminUsername } from '@/lib/adminUsername';
import { serverDeploymentCountry } from '@/lib/deploymentServer';

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const missingPasswordFlag=(error)=>error?.code==='42703'||String(error?.message||'').includes('must_change_password');

export async function POST(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.until > now && entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }
  try {
    const body = await request.json();
    let session;
    if (body.mode === 'emergency') {
      if (!body.pin) return NextResponse.json({ error: 'Enter the emergency PIN.' }, { status: 400 });
      if (!verifyAdminPin(body.pin)) {
        attempts.set(key, { count: (entry?.until > now ? entry.count : 0) + 1, until: now + WINDOW_MS });
        return NextResponse.json({ error: 'Incorrect emergency PIN.' }, { status: 401 });
      }
      session = { type:'emergency', role:'super_admin', displayName:'Emergency access', userId:null, emergency:true, countryScope:serverDeploymentCountry(), restaurantId:null };
    } else {
      const username=normalizeAdminUsername(body.username);
      const password=String(body.password||'');
      if (!validAdminUsername(username) || !password) return NextResponse.json({ error:'Enter your username and password.' }, { status:400 });
      const authClient=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const { data:authData, error:authError }=await authClient.auth.signInWithPassword({email:adminUsernameEmail(username),password});
      if(authError||!authData.user){
        attempts.set(key,{count:(entry?.until>now?entry.count:0)+1,until:now+WINDOW_MS});
        return NextResponse.json({error:'Invalid username or password.'},{status:401});
      }
      const {data:profile,error:profileError}=await supabaseAdmin.from('admin_profiles').select('user_id,username,display_name,role,active,must_change_password,country_scope,restaurant_id').eq('user_id',authData.user.id).maybeSingle();
      if(profileError?.code==='42703'||['country_scope','restaurant_id'].some(column=>String(profileError?.message||'').includes(column))) return NextResponse.json({error:'Restaurant-scoped admin access is not installed yet. Run ADMIN_ACCOUNTS_MIGRATION.sql in Supabase.'},{status:503});
      if(profileError||!profile?.active||!['inventory','admin','super_admin'].includes(profile.role)) return NextResponse.json({error:'This account does not have active dashboard access.'},{status:403});
      if(profile.country_scope!==serverDeploymentCountry()) return NextResponse.json({error:`This account cannot access the ${serverDeploymentCountry()} admin deployment.`},{status:403});
      session={type:'account',userId:profile.user_id,username:profile.username,displayName:profile.display_name,role:profile.role,mustChangePassword:Boolean(profile.must_change_password),emergency:false,countryScope:profile.country_scope,restaurantId:profile.restaurant_id||null};
    }
    attempts.delete(key);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createAdminToken(session), adminCookieOptions);
    await logAdminAction(session,'auth.login');
    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to sign in.' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session=await resolveAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
    if(!session) return NextResponse.json({error:'Admin sign-in required.'},{status:401});
    if(session.emergency) return NextResponse.json({error:'Emergency PIN sessions do not have an account password.'},{status:400});
    const body=await request.json();
    const currentPassword=String(body.current_password||'');
    const newPassword=String(body.new_password||'');
    if(!currentPassword) return NextResponse.json({error:'Enter your current password.'},{status:400});
    if(newPassword.length<8) return NextResponse.json({error:'Your new password must contain at least 8 characters.'},{status:400});
    if(newPassword===currentPassword) return NextResponse.json({error:'Choose a new password different from the temporary password.'},{status:400});
    const {error:flagError}=await supabaseAdmin.from('admin_profiles').select('must_change_password').eq('user_id',session.userId).single();
    if(missingPasswordFlag(flagError)) return NextResponse.json({error:'Password changes need the ADMIN_PASSWORD_CHANGE_MIGRATION.sql update first.'},{status:503});
    if(flagError) throw flagError;
    const authClient=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {error:verifyError}=await authClient.auth.signInWithPassword({email:adminUsernameEmail(session.username),password:currentPassword});
    if(verifyError) return NextResponse.json({error:'The current password is incorrect.'},{status:401});
    const {error:updateError}=await supabaseAdmin.auth.admin.updateUserById(session.userId,{password:newPassword});
    if(updateError) throw updateError;
    const {error:profileError}=await supabaseAdmin.from('admin_profiles').update({must_change_password:false,updated_at:new Date().toISOString()}).eq('user_id',session.userId);
    if(profileError) throw profileError;
    await logAdminAction(session,'auth.password_changed','admin_account',session.userId);
    return NextResponse.json({ok:true});
  } catch(error) {
    return NextResponse.json({error:error.message||'Unable to change password.'},{status:500});
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { ...adminCookieOptions, maxAge: 0 });
  return response;
}
