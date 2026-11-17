import React, { useState } from 'react';
import { Lock, LogIn, ShieldCheck, User, X } from 'lucide-react';
import type { SystemUser } from '../types/payroll';
import { USER_ROLE_LABELS, authenticateUser } from '../utils/payroll';

interface AuthPanelProps {
  mode: 'page' | 'modal';
  companyName: string;
  users: SystemUser[];
  currentUser: SystemUser | null;
  onLogin: (user: SystemUser) => void;
  onClose?: () => void;
}

export const AuthPanel: React.FC<AuthPanelProps> = ({
  mode,
  companyName,
  users,
  currentUser,
  onLogin,
  onClose,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = authenticateUser(users, username, password);
    if (!res.user) {
      setError(res.error ?? 'خطا در ورود به سامانه');
      return;
    }
    setError(null);
    onLogin(res.user);
  };

  const quickFill = (u: SystemUser) => {
    setUsername(u.username);
    setPassword(u.password);
    setError(null);
  };

  const card = (
    <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>احراز هویت و سطح دسترسی</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            {mode === 'page' ? 'ورود به سامانه حقوق و دستمزد' : 'تغییر حساب کاربری'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{companyName}</p>
        </div>
        {mode === 'modal' && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره ورود"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
        {currentUser && mode === 'modal' && (
          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
            کاربر فعلی:{' '}
            <strong className="text-slate-900">{currentUser.fullName}</strong> (
            {currentUser.role === 'admin' ? 'ادمین سیستم' : 'کاربر عادی'})
          </div>
        )}

        <div>
          <label
            htmlFor="auth-username"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5"
          >
            <User className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>نام کاربری</span>
          </label>
          <input
            id="auth-username"
            type="text"
            dir="ltr"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5"
          >
            <Lock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>رمز عبور</span>
          </label>
          <input
            id="auth-password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
        >
          <LogIn className="w-4 h-4" aria-hidden="true" />
          <span>ورود به سامانه</span>
        </button>

        {/* Quick account list for convenient testing & switching */}
        <div className="pt-4 border-t border-slate-200 space-y-2">
          <div className="text-[11px] font-medium text-slate-500">
            حساب‌های تعریف‌شده در سیستم (کلیک برای تکمیل خودکار):
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {users
              .filter((u) => u.isActive)
              .map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => quickFill(u)}
                  className="w-full flex items-center justify-between px-3 py-2 text-right text-xs border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 rounded-md transition-colors"
                >
                  <div>
                    <span className="font-semibold text-slate-800">
                      {u.fullName}
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      {USER_ROLE_LABELS[u.role]}
                    </span>
                  </div>
                  <span
                    className="font-mono-num text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded"
                    dir="ltr"
                  >
                    {u.username}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </form>
    </div>
  );

  if (mode === 'page') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ورود یا تغییر حساب کاربری"
    >
      {card}
    </div>
  );
};
