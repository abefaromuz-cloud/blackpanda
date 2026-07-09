import { createContext, useContext, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('bp_user') || 'null'));
  const [permissions, setPermissions] = useState(() => JSON.parse(localStorage.getItem('bp_perms') || 'null'));
  const navigate = useNavigate();

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('bp_token', data.token);
    localStorage.setItem('bp_user', JSON.stringify(data.user));
    localStorage.setItem('bp_perms', JSON.stringify(data.permissions));
    setUser(data.user); setPermissions(data.permissions);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('bp_token');
    localStorage.removeItem('bp_user');
    localStorage.removeItem('bp_perms');
    setUser(null); setPermissions(null);
    navigate('/login');
  }, [navigate]);

  // Может ли пользователь просматривать/редактировать страницу. Admin — всегда полный доступ.
  const can = useCallback((pageKey, mode = 'view') => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const p = permissions?.[pageKey];
    if (!p) return false;
    return mode === 'edit' ? !!p.can_edit : !!p.can_view;
  }, [user, permissions]);

  return (
    <AuthContext.Provider value={{ user, permissions, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
