import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t, lang, setLang } = useLang();

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'client' ? '/portal' : '/');
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Ошибка входа');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-5 relative">
      <button onClick={() => setLang(lang === 'ru' ? 'zh' : 'ru')}
        className="absolute top-5 right-5 text-xs px-3 py-1.5 rounded-full border border-border text-text2 hover:text-text hover:border-accent transition">
        {lang === 'ru' ? '中文' : 'RU'}
      </button>
      <form onSubmit={submit} className="card w-full max-w-sm relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-accent/10 blur-2xl" />
        <div className="flex items-center gap-3 mb-6 relative">
          <img src="/panda-logo-icon.png" alt="" className="w-11 h-11 rounded-xl object-contain bg-bg3 border border-border p-1" />
          <div>
            <div className="text-xl font-black tracking-tight">BlackPanda</div>
            <div className="text-[11px] text-text3 uppercase tracking-wider">CRM</div>
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('email')}</label>
          <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="mb-4">
          <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('password')}</label>
          <input className="inp" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {err && <div className="text-red text-xs mb-3 text-center">{err}</div>}
        <button className="btn btn-primary w-full justify-center" disabled={loading}>
          {loading ? t('loggingIn') : t('login')}
        </button>
      </form>
    </div>
  );
}
