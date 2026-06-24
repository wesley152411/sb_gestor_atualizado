'use client';

import { useState, useEffect } from 'react';
import { LogOut, Key, User, Camera } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { saveDecoratorProfile, signOut, resetPassword } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Decorator } from '@/types';

export default function SettingsPage() {
  const { decorator, updateDecorator, setDecorator } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const [profile, setProfile] = useState<Partial<Decorator>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (decorator) setProfile(decorator);
  }, [decorator]);

  const handleSaveProfile = async () => {
    if (!profile.id) return;
    setIsLoading(true);
    const updated = await saveDecoratorProfile(profile as Decorator);
    updateDecorator(updated);
    addNotification('Perfil Atualizado', 'Suas informações foram salvas com sucesso.');
    setIsLoading(false);
  };

  const handleLogout = async () => {
    if (confirm('Deseja realmente sair?')) {
      await signOut();
      setDecorator(null);
      // Middleware will handle redirect to login
      window.location.href = '/login';
    }
  };

  const handleResetPassword = async () => {
    // In a real scenario, we'd need the user's email. For simplicity, we ask or assume it's linked to the session.
    const email = prompt('Digite seu e-mail para receber o link de redefinição de senha:');
    if (email) {
      const res = await resetPassword(email);
      addNotification(res.success ? 'Email Enviado' : 'Erro', res.message || '', !res.success);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="page-header mb-8">
        <div>
          <h1 className="page-title">Configurações da Conta</h1>
          <p className="page-subtitle">Gerencie seu perfil, preferências e segurança.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <User className="text-indigo-600" />
          <h2 className="text-lg font-bold">Perfil da Decoradora</h2>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
            <div className="relative group cursor-pointer">
              <img src={profile.avatar_url} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 border-slate-100" />
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="text-white w-6 h-6" />
              </div>
            </div>
            <div className="flex-1">
              <Input label="Nome da Empresa" value={profile.name || ''} onChange={e => setProfile({...profile, name: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Input label="WhatsApp" placeholder="(00) 00000-0000" value={profile.whatsapp || ''} onChange={e => setProfile({...profile, whatsapp: e.target.value})} />
            <Input label="Instagram" placeholder="@suaempresa" value={profile.instagram || ''} onChange={e => setProfile({...profile, instagram: e.target.value})} />
            <Input label="Cidade / Estado" value={profile.location || ''} onChange={e => setProfile({...profile, location: e.target.value})} className="col-span-2" />
          </div>

          <div className="form-group">
            <label className="form-label">Sobre a Empresa</label>
            <textarea 
              className="form-input" 
              rows={4}
              placeholder="Conte um pouco sobre sua empresa, estilo de decoração e diferenciais..."
              value={profile.about || ''}
              onChange={e => setProfile({...profile, about: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label className="form-label">URL da Foto de Capa (Marketplace)</label>
            <Input placeholder="https://..." value={profile.cover_url || ''} onChange={e => setProfile({...profile, cover_url: e.target.value})} />
            <p className="text-xs text-slate-500 mt-2">Esta foto aparecerá na sua página pública de locação B2B.</p>
          </div>

          <div className="pt-4 flex justify-end">
            <Button onClick={handleSaveProfile} isLoading={isLoading}>Salvar Alterações</Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-red-600">Zona de Perigo & Segurança</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
            <div>
              <h4 className="font-bold">Alterar Senha</h4>
              <p className="text-sm text-slate-500">Enviaremos um link de recuperação para seu e-mail.</p>
            </div>
            <Button variant="secondary" icon={Key} onClick={handleResetPassword}>Redefinir</Button>
          </div>
          
          <div className="flex items-center justify-between p-4 border border-red-100 bg-red-50 rounded-lg">
            <div>
              <h4 className="font-bold text-red-700">Encerrar Sessão</h4>
              <p className="text-sm text-red-500">Sair da sua conta neste dispositivo.</p>
            </div>
            <Button variant="danger" icon={LogOut} onClick={handleLogout}>Sair da Conta</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
