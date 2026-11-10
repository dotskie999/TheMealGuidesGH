import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminToken } from '@/lib/adminAuth';
import { serverDeploymentCountry } from '@/lib/deploymentServer';

export const ADMIN_ROLES = ['inventory', 'admin', 'super_admin'];

export async function resolveAdminSession(token) {
  const tokenSession = verifyAdminToken(token);
  if (!tokenSession) return null;
  if (tokenSession.type === 'emergency') return {
    type:'emergency', userId:null, displayName:'Emergency access', email:null, role:'super_admin', emergency:true, countryScope:serverDeploymentCountry(), restaurantId:null,
  };
  let { data, error } = await supabaseAdmin
    .from('admin_profiles')
    .select('user_id,username,display_name,role,active,must_change_password,country_scope,restaurant_id')
    .eq('user_id', tokenSession.userId)
    .maybeSingle();
  if (error || !data || !data.active || !ADMIN_ROLES.includes(data.role) || data.country_scope!==serverDeploymentCountry()) return null;
  return { type:'account', userId:data.user_id, username:data.username, displayName:data.display_name, role:data.role, mustChangePassword:Boolean(data.must_change_password), emergency:false, countryScope:data.country_scope, restaurantId:data.restaurant_id||null };
}

export async function logAdminAction(session, action, targetType = null, targetId = null, details = {}) {
  const { error } = await supabaseAdmin.from('admin_activity_logs').insert({
    actor_user_id:session.userId,
    actor_name:session.displayName,
    actor_role:session.role,
    actor_type:session.emergency?'emergency':'account',
    country_scope:session.countryScope||serverDeploymentCountry(),
    restaurant_id:session.restaurantId||null,
    action,
    target_type:targetType,
    target_id:targetId ? String(targetId) : null,
    details,
  });
  if (error && !['42P01','PGRST205'].includes(error.code)) console.error('Could not write admin audit log:', error.message);
}
