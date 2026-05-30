import React, { useEffect, useState } from 'react';
import { Mail, Lock, LogIn, UserPlus, Cpu, AlertCircle, RefreshCw } from 'lucide-react';
import { useChatStore } from './stores/chatStore';
import { apiClient } from './api/client';
import { ChatInterface } from './components/ChatInterface';

const App: React.FC = () => {
  const { accessToken, authRefreshError, setAuth, clearAuth, setAuthRefreshError } = useChatStore();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decode JWT payload from the access token (base64url-encoded JSON)
  const decodeJWT = (token: string): Record<string, any> | null => {
    try {
      const payload = token.split('.')[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  };

  // Sync token state and listen for session failures
  useEffect(() => {
    const checkUserSession = async () => {
      if (accessToken) {
        try {
          // If we have token, try to load user details to verify it is valid
          // In FastAPI backend, we don't have a /auth/me, but we can verify by hitting /documents
          await apiClient.get('/documents');
          // Extract email from JWT payload instead of hardcoding
          const payload = decodeJWT(accessToken);
          const tokenEmail = payload?.email || 'user@example.com';
          setAuth({ id: 'current', email: tokenEmail, created_at: '' }, accessToken, localStorage.getItem('refreshToken') || '');
        } catch (err) {
          console.error('Session validation failed:', err);
          handleLogout();
        }
      }
    };
    checkUserSession();

    // Listen to global logout broadcast from axios client
    const handleGlobalLogout = () => {
      handleLogout();
    };
    window.addEventListener('auth-logout', handleGlobalLogout);
    
    // Listen to auth token refresh events
    const handleAuthRefreshing = () => {
      useChatStore.getState().setAuthRefreshing(true);
    };
    const handleAuthRefreshed = () => {
      useChatStore.getState().setAuthRefreshing(false);
    };
    const handleAuthRefreshFailed = (e: Event) => {
      const ce = e as CustomEvent;
      useChatStore.getState().setAuthRefreshing(false);
      useChatStore.getState().setAuthRefreshError(ce.detail || 'Session expired. Please sign in again.');
    };
    window.addEventListener('auth-refreshing', handleAuthRefreshing);
    window.addEventListener('auth-refreshed', handleAuthRefreshed);
    window.addEventListener('auth-refresh-failed', handleAuthRefreshFailed);
    
    return () => {
      window.removeEventListener('auth-logout', handleGlobalLogout);
      window.removeEventListener('auth-refreshing', handleAuthRefreshing);
      window.removeEventListener('auth-refreshed', handleAuthRefreshed);
      window.removeEventListener('auth-refresh-failed', handleAuthRefreshFailed);
    };
  }, [accessToken]);

  // Clear auth refresh error when user interacts with the form
  const clearErrors = () => {
    setError(null);
    setAuthRefreshError(null);
  };

  const handleLogout = () => {
    clearAuth();
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all details.');
      setLoading(false);
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        // Sign In
        const response = await apiClient.post('/auth/login', { email, password });
        const { access_token, refresh_token } = response.data;
        
        // Load documents list to ensure auth context works, then set state
        await apiClient.get('/documents', {
          headers: { Authorization: `Bearer ${access_token}` },
        });

        setAuth(
          { id: crypto.randomUUID(), email, created_at: new Date().toISOString() },
          access_token,
          refresh_token
        );
      } else {
        // Sign Up
        await apiClient.post('/auth/register', { email, password });
        setIsLogin(true);
        setError('Account created successfully! Please log in below.');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      console.error('Auth failure:', err);
      setError(err.response?.data?.detail || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // If user is authenticated, open the chat workspace
  if (accessToken) {
    return <ChatInterface onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-950 overflow-hidden relative p-4">
      {/* Background glowing spheres */}
      <div className="absolute top-[10%] left-[10%] w-[35%] h-[35%] bg-indigo-900/10 rounded-full blur-[100px] animate-pulse-subtle"></div>
      <div className="absolute bottom-[10%] right-[10%] w-[35%] h-[35%] bg-purple-900/10 rounded-full blur-[100px] animate-pulse-subtle"></div>

      <div className="w-full max-w-md p-8 rounded-2xl glass-panel border-slate-900 shadow-2xl relative z-10 animate-float-slow">
        {/* Brand Banner */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 border border-indigo-400/20 shadow-lg shadow-indigo-950/40">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold font-outfit text-slate-100 tracking-wide">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            {isLogin 
              ? 'Sign in to access your document indexes and chat history.' 
              : 'Sign up to build your custom document vector databases.'
            }
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error alerts — show auth refresh error first, then form errors */}
          {authRefreshError && (
            <div className="p-3 rounded-lg border border-amber-950 bg-amber-950/20 text-amber-300 text-xs flex items-start space-x-2 animate-stream">
              <RefreshCw className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span className="leading-relaxed">{authRefreshError}</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg border border-red-950 bg-red-950/20 text-red-300 text-xs flex items-start space-x-2 animate-stream">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Email input */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
                placeholder="developer@ltimindtree.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-slate-200 placeholder-slate-600 text-sm glass-input"
              />
            </div>
          </div>

          {/* Password input */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
                placeholder="Minimum 8 characters"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-slate-200 placeholder-slate-600 text-sm glass-input"
              />
            </div>
          </div>

          {/* Confirm Password (Sign up only) */}
          {!isLogin && (
            <div className="space-y-1 animate-stream">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-slate-200 placeholder-slate-600 text-sm glass-input"
                />
              </div>
            </div>
          )}

          {/* Action button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-900 text-white disabled:text-slate-500 font-semibold text-xs tracking-wider uppercase transition-all shadow-md shadow-indigo-950/40 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>Verify & Sign In</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Create Identity</span>
              </>
            )}
          </button>
        </form>

        {/* Footer switch link */}
        <div className="text-center mt-6">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:text-indigo-400 transition-colors"
          >
            {isLogin 
              ? "Don't have a workspace account? Register" 
              : 'Already have a registered account? Sign In'
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
