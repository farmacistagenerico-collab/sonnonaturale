import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
const browser=readFileSync(new URL('../supabase-client.js',import.meta.url),'utf8')+readFileSync(new URL('../supabase-config.js',import.meta.url),'utf8');
const tables=['profiles','coach_clients','sleep_entries','goals','goal_completions','coach_notes','messages','privacy_consents'];

test('all personal-data tables enable RLS and define policies',()=>{
 for(const table of tables){assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`),`${table} must have RLS enabled`);assert.match(sql,new RegExp(`create policy [^\\n]+ on public\\.${table}`),`${table} must have an explicit policy`)}
});

test('browser has no service-role key and profile role is not client-updatable',()=>{
 assert.doesNotMatch(browser,/service_role\s*[:=]\s*['"][^'"]+['"]/i);
 assert.match(sql,/grant update \(full_name, preferred_language\) on public\.profiles to authenticated/i);
 assert.doesNotMatch(sql,/grant update\s*\([^)]*\brole\b[^)]*\) on public\.profiles/i);
 assert.match(sql,/values\s*\([\s\S]*?'client'/i);
});

test('client completion and coach writes are scoped to valid assignments',()=>{
 assert.match(sql,/create policy "goal_completions_client_create"[\s\S]*?client_id = \(select auth\.uid\(\)\)[\s\S]*?g\.client_id = \(select auth\.uid\(\)\)/i);
 assert.match(sql,/create policy "goals_coach_create"[\s\S]*?created_by = \(select auth\.uid\(\)\)[\s\S]*?public\.is_assigned_client\(client_id\)/i);
 assert.match(sql,/create policy "messages_send_within_assignment"[\s\S]*?sender_id = \(select auth\.uid\(\)\)[\s\S]*?public\.coach_clients/i);
});
