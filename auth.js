/**
 * UniMart — Auth module (Supabase)
 */
 
const SUPABASE_URL      = 'https://xdxnzkowvmphveiwzufm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WqqtaVhge6rIPosltnGktw_xVHBE5L_';
 
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 
const Auth = (() => {
 
  /* ---------- sign-up ---------- */
  async function signUp({ fullName, email, password, accountType, university, uniCampus, studentNumber }) {
    const { error } = await _sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          account_type: accountType,
          university: university || null,
          uni_campus: uniCampus || null,
          student_number: studentNumber || null,
        }
      }
    });
    if (error) return { error: error.message };
    return { success: true };
  }
 
  /* ---------- sign-in ---------- */
  async function signIn({ email, password }) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { success: true, user: _buildUser(data.user) };
  }
 
  /* ---------- OTP verification (sign-up email confirmation) ---------- */
  async function verifyOTP(email, token) {
    const { data, error } = await _sb.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) return { error: error.message };
    if (data.user) {
      const meta = data.user.user_metadata || {};
      await _sb.from('users').upsert({
        id: data.user.id,
        full_name: meta.full_name,
        email: data.user.email,
        account_type: meta.account_type || 'buyer',
        university: meta.university || null,
        uni_campus: meta.uni_campus || null,
        student_number: meta.student_number || null,
      });
    }
    return { success: true };
  }
 
  /* ---------- sign-out ---------- */
  async function signOut() {
    await _sb.auth.signOut();
    window.location.href = 'login.html';
  }
 
  /* ---------- session / auth guard ---------- */
  async function requireAuth() {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    return _getProfile(session.user);
  }
 
  async function getUser() {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) return null;
    return _getProfile(session.user);
  }
 
  /* ---------- profile update (personal details) ---------- */
  async function updateProfile({ id, fullName, email, accountType }) {
    const [{ error: dbErr }, { error: authErr }] = await Promise.all([
      _sb.from('users').update({
        full_name: fullName,
        email: email.toLowerCase(),
        account_type: accountType,
      }).eq('id', id),
      _sb.auth.updateUser({ data: { full_name: fullName, account_type: accountType } }),
    ]);
    if (dbErr || authErr) return { error: (dbErr || authErr).message };
    return { success: true };
  }
 
  /* ---------- campus info update ---------- */
  async function updateCampusInfo({ id, university, uniCampus, studentNumber }) {
    const { error } = await _sb.from('users').update({
      university: university || null,
      uni_campus: uniCampus || null,
      student_number: studentNumber || null,
    }).eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  }
 
  /* ---------- password update ---------- */
  async function updatePassword({ currentPassword, newPassword, email }) {
    const { error: reAuthErr } = await _sb.auth.signInWithPassword({ email, password: currentPassword });
    if (reAuthErr) return { error: 'Incorrect current password.' };
    const { error: updateErr } = await _sb.auth.updateUser({ password: newPassword });
    if (updateErr) return { error: updateErr.message };
    return { success: true };
  }
 
  /* ---------- helpers ---------- */
  async function _getProfile(authUser) {
    const { data } = await _sb.from('users').select('*').eq('id', authUser.id).single();
    if (data) {
      return {
        id: data.id,
        fullName: data.full_name,
        email: data.email || authUser.email,
        accountType: data.account_type || 'buyer',
        university: data.university || '',
        uniCampus: data.uni_campus || '',
        studentNumber: data.student_number || '',
      };
    }
    const meta = authUser.user_metadata || {};
    return {
      id: authUser.id,
      fullName: meta.full_name || authUser.email,
      email: authUser.email,
      accountType: meta.account_type || 'buyer',
      university: meta.university || '',
      uniCampus: meta.uni_campus || '',
      studentNumber: meta.student_number || '',
    };
  }
 
  function _buildUser(authUser) {
    if (!authUser) return null;
    const meta = authUser.user_metadata || {};
    return {
      id: authUser.id,
      fullName: meta.full_name || authUser.email,
      email: authUser.email,
      accountType: meta.account_type || 'buyer',
      university: meta.university || '',
      uniCampus: meta.uni_campus || '',
      studentNumber: meta.student_number || '',
    };
  }
 
  function getUserInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }
 
  return { signUp, signIn, verifyOTP, signOut, requireAuth, getUser, getUserInitials, updateProfile, updateCampusInfo, updatePassword };
})();
