// Debug: Check if the auth changes work with real user metadata
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.log('❌ Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

console.log('🔍 Testing Real User Metadata from Database');
console.log('==========================================');

async function testUserMetadata() {
  try {
    // Get a real user from auth.users with metadata
    const { data: authUsers, error } = await supabase
      .from('auth.users')
      .select('email, raw_user_meta_data')
      .limit(5);

    if (error) {
      console.log('❌ Error querying auth users:', error.message);
      return;
    }

    console.log('📊 Auth Users Sample:');
    authUsers.forEach((user, i) => {
      console.log(`\n${i + 1}. ${user.email}`);
      console.log(`   Metadata:`, user.raw_user_meta_data);
      console.log(`   Has role: ${user.raw_user_meta_data?.role ? '✅' : '❌'}`);
    });

  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

testUserMetadata();