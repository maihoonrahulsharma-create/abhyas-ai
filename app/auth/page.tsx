
'use client';
import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
const DISPOSABLE_EMAIL_DOMAINS=new Set(['mailinator.com','guerrillamail.com','guerrillamailblock.com','10minutemail.com','temp-mail.org','tempmail.com','yopmail.com','sharklasers.com','getnada.com','dispostable.com']);
type AuthMode='login'|'signup'|'forgot';
function GoogleIcon(){return <svg className="social-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.41-.18-2.07H12v3.92h5.24a4.48 4.48 0 0 1-1.95 2.94v2.45h3.16c1.85-1.7 2.9-4.2 2.9-7.24Z"/><path fill="#34A853" d="M12 21.75c2.64 0 4.86-.87 6.48-2.34l-3.16-2.45c-.87.58-1.98.92-3.32.92-2.55 0-4.71-1.72-5.48-4.03H3.25v2.53A9.79 9.79 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.52 13.85A5.88 5.88 0 0 1 6.21 12c0-.64.11-1.26.31-1.85V7.62H3.25A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1 4.38l3.27-2.53Z"/><path fill="#EA4335" d="M12 6.12c1.44 0 2.73.5 3.75 1.48l2.81-2.81C16.85 3.24 14.64 2.25 12 2.25a9.79 9.79 0 0 0-8.75 5.37l3.27 2.53C7.29 7.84 9.45 6.12 12 6.12Z"/></svg>}
function AppleIcon(){return <svg className="social-svg apple-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.77 12.7c.02 2.05 1.8 2.73 1.82 2.74-.02.05-.28.97-.93 1.92-.56.82-1.15 1.64-2.08 1.66-.91.02-1.2-.53-2.24-.53-1.05 0-1.37.51-2.23.55-.9.03-1.58-.89-2.14-1.71-1.16-1.67-2.05-4.72-.86-6.78.59-1.03 1.65-1.68 2.8-1.7.88-.02 1.72.59 2.24.59.51 0 1.47-.73 2.48-.62.42.02 1.61.17 2.37 1.3-.06.04-1.42.83-1.4 2.58ZM15.13 3.78c.46-.56 1.22-.98 1.92-1.03.09.8-.23 1.6-.69 2.16-.46.56-1.2.99-1.94.93-.1-.77.24-1.59.71-2.06Z"/></svg>}
function FacebookIcon(){return <svg className="social-svg facebook-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path fill="#fff" d="M13.3 19v-6h2l.3-2.3h-2.3V9.3c0-.67.19-1.13 1.17-1.13h1.25V6.12c-.22-.03-.99-.1-1.89-.1-1.87 0-3.15 1.14-3.15 3.23v1.45H8.6V13h2.08v6h2.62Z"/></svg>}
export default function AuthPage(){
 const supabase=createClient();const router=useRouter();
 const [mode,setMode]=useState<AuthMode>('login');
 const [fullName,setFullName]=useState('');const [mobile,setMobile]=useState('');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirmPassword,setConfirmPassword]=useState('');
 const [busy,setBusy]=useState(false);const [socialBusy,setSocialBusy]=useState(false);const [msg,setMsg]=useState('');const [success,setSuccess]=useState('');
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  if(params.get('error')==='google_signin_failed')setMsg('Google sign-in could not be completed. Please try again.');
 },[]);
 function switchMode(next:AuthMode){setMode(next);setMsg('');setSuccess('');}
 async function signInWithSocial(provider:'google'|'facebook'|'apple'){
  setSocialBusy(true);setMsg('');setSuccess('');
  try{
   const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:`${window.location.origin}/auth/callback`}});
   if(error)throw error;
  }catch(e){setMsg(e instanceof Error?e.message:`${provider} sign-in failed.`)}finally{setSocialBusy(false)}
 }
 async function signInWithGoogle(){
  setSocialBusy(true);setMsg('');setSuccess('');
  try{
   const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/auth/callback`}});
   if(error)throw error;
  }catch(e){setMsg(e instanceof Error?e.message:'Google sign-in failed.')}finally{setSocialBusy(false)}
 }
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setMsg('');setSuccess('');
  try{
   if(mode==='login'){
    const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;
    const metadata=data.user?.user_metadata as {full_name?:string;mobile?:string}|undefined;
    if(data.user&&metadata?.full_name&&metadata?.mobile){await supabase.from('profiles').upsert({id:data.user.id,full_name:metadata.full_name,mobile:metadata.mobile,updated_at:new Date().toISOString()});}
    router.push('/');router.refresh();return;
   }
   if(mode==='forgot'){
    if(!email.trim())throw new Error('Enter your email address.');
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/reset-password`});if(error)throw error;
    setSuccess('Password reset link sent. Check your email.');return;
   }
   const cleanName=fullName.trim(),cleanMobile=mobile.replace(/\D/g,''),cleanEmail=email.trim().toLowerCase();
   const domain=cleanEmail.split('@')[1]||'';
   if(!domain||DISPOSABLE_EMAIL_DOMAINS.has(domain))throw new Error('Please use a regular email address. Temporary/disposable email domains are not supported.');
   if(cleanName.length<2)throw new Error('Please enter your full name.');
   if(!/^\d{10}$/.test(cleanMobile))throw new Error('Mobile number must be exactly 10 digits.');
   if(password.length<8)throw new Error('Password must be at least 8 characters.');
   if(password!==confirmPassword)throw new Error('Passwords do not match.');
   const {data,error}=await supabase.auth.signUp({email:cleanEmail,password,options:{data:{full_name:cleanName,mobile:cleanMobile}}});
   if(error)throw error;
   if(data.user&&data.session){
    const {error:profileError}=await supabase.from('profiles').upsert({id:data.user.id,full_name:cleanName,mobile:cleanMobile,updated_at:new Date().toISOString()});
    if(profileError)throw profileError;
    router.push('/');router.refresh();return;
   }
   setSuccess('Account created. Check your email to confirm, then log in.');
   setMode('login');setPassword('');setConfirmPassword('');
  }catch(e){setMsg(e instanceof Error?e.message:'Something went wrong.')}finally{setBusy(false)}
 }
 const login=mode==='login',signup=mode==='signup',forgot=mode==='forgot';
 return <main className="qf-auth-page"><div className="qf-auth-decor"><div className="qf-cloud cloud1"/><div className="qf-cloud cloud2"/><div className="qf-plant plant1"><i/><i/><i/><b/></div><div className="qf-flower"><i/><i/><i/><i/><b/></div></div><div className={`qf-phone ${signup?'signup-mode':''} ${forgot?'forgot-mode':''}`}>
  <div className="qf-heart"><span>♥</span></div>
  <div className="qf-brand"><span className="qf-brand-icon"><img src="/icon.svg" alt="" aria-hidden="true"/></span><strong>Bheja Fry</strong></div>
  <div className="qf-auth-title"><h1>{login?'Welcome Back':signup?'Create Account':'Reset Password'}</h1><p>{login?'Login to continue your journey':signup?'Create your ABHYAS account to start learning':'Enter your email and we’ll send a reset link'}</p></div>
  <form className="qf-auth-form" onSubmit={submit}>
   {signup&&<>
    <label><span>👤</span><input type="text" required autoComplete="name" placeholder="Full Name" value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
    <label><span>📱</span><input type="tel" required inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="Mobile Number (10 digits)" value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,'').slice(0,10))}/></label>
   </>}
   <label><span>✉</span><input type="email" required autoComplete="email" placeholder="Email Address" value={email} onChange={e=>setEmail(e.target.value)}/></label>
   {!forgot&&<label><span>🔒</span><input type="password" required minLength={8} autoComplete={login?'current-password':'new-password'} placeholder="Password (8+ characters)" value={password} onChange={e=>setPassword(e.target.value)}/></label>}
   {signup&&<label><span>✓</span><input type="password" required minLength={8} autoComplete="new-password" placeholder="Confirm Password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>}
   {login&&<div className="qf-forgot"><button type="button" onClick={()=>switchMode('forgot')}><span>🔒</span> Forgot Password? <b>→</b></button></div>}
   <button className="qf-auth-btn" disabled={busy}>{busy?'Please wait…':login?'Login':signup?'Continue':'Send Reset Link'}</button>
   {!forgot&&<><div className="qf-or"><span>or continue with</span></div><div className="qf-socials"><button type="button" aria-label="Continue with Google" onClick={()=>signInWithSocial('google')} disabled={busy||socialBusy}><span className="social-icon google"><GoogleIcon/></span><span>Google</span></button><button type="button" aria-label="Continue with Apple" onClick={()=>signInWithSocial('apple')} disabled={busy||socialBusy}><span className="social-icon apple"><AppleIcon/></span><span>Apple</span></button><button type="button" aria-label="Continue with Facebook" onClick={()=>signInWithSocial('facebook')} disabled={busy||socialBusy}><span className="social-icon facebook"><FacebookIcon/></span><span>Facebook</span></button></div></>}
   {!forgot?<p className="qf-signup">{login?"Don't have an account?":"Already have an account?"} <button type="button" onClick={()=>switchMode(login?'signup':'login')}>{login?'Sign Up':'Login'}</button></p>:<p className="qf-signup"><button type="button" onClick={()=>switchMode('login')}>Back to Login</button></p>}
   {signup&&<p className="qf-auth-note">Your name, mobile number and email are saved with your account. AI keys can be added later in Settings.</p>}
   {success&&<div className="qf-auth-success">{success}</div>}{msg&&<div className="qf-auth-error">{msg}</div>}
  </form><div className="qf-sparkles">✦　✧　♡</div>
 </div></main>
}
