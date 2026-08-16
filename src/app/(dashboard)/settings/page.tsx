'use client';

import { useState, useEffect, useRef } from 'react';
import { LogOut, Key, Camera, MapPin } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { saveDecoratorProfile, signOut, resetPassword, uploadImage } from '@/services/api';
import { detectCity } from '@/lib/geolocation';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Decorator } from '@/types';

export default function SettingsPage() {
  const { decorator, updateDecorator, setDecorator } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const [profile, setProfile] = useState<Partial<Decorator>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (decorator) setProfile(decorator);
  }, [decorator]);

  const handleSaveProfile = async () => {
    if (!profile.id) return;
    setIsLoading(true);
    // Nota: whatsapp / instagram / about / cover_url não têm mais campo nesta tela,
    // mas continuam no estado (carregados do perfil) e são re-salvos sem alteração,
    // preservando os dados usados na Minha Página e no orçamento público.
    const updated = await saveDecoratorProfile(profile as Decorator);
    updateDecorator(updated);
    addNotification('Perfil Atualizado', 'Suas informações foram salvas com sucesso.');
    setIsLoading(false);
  };

  // Envia para o Supabase Storage (bucket "avatars"); se falhar, cai para base64.
  // Mesmo padrão usado no upload de imagens do Acervo.
  const processAvatarUpload = async (file: File): Promise<string> => {
    if (!profile.id) return '';
    const path = `${profile.id}/${Date.now()}_${file.name}`;
    try {
      const url = await uploadImage(file, 'avatars', path);
      if (url) return url;
    } catch (err) {
      console.warn('Storage upload failed, falling back to base64', err);
    }
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo depois
    if (!file || !profile.id) return;
    if (!file.type.startsWith('image/')) {
      addNotification('Arquivo inválido', 'Selecione um arquivo de imagem.', true);
      return;
    }
    setIsUploadingAvatar(true);
    try {
      const avatar_url = await processAvatarUpload(file);
      const updatedProfile = { ...profile, avatar_url };
      setProfile(updatedProfile);
      const saved = await saveDecoratorProfile(updatedProfile as Decorator);
      updateDecorator(saved);
      addNotification('Foto Atualizada', 'Sua foto de perfil foi alterada com sucesso.');
    } catch (err) {
      console.error(err);
      addNotification('Erro', 'Não foi possível alterar a foto.', true);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Mesmo fluxo do cadastro: GPS -> "Cidade - UF" (função única em lib/geolocation).
  const handleUseGPS = async () => {
    setIsLocating(true);
    try {
      const { label } = await detectCity();
      setProfile(p => ({ ...p, location: label }));
      addNotification('Localização definida', `Cidade detectada: ${label}. Clique em Salvar para confirmar.`);
    } catch (err) {
      addNotification('Localização', err instanceof Error ? err.message : 'Não foi possível obter a localização.', true);
    } finally {
      setIsLocating(false);
    }
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
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações da Conta</h1>
          <p className="page-subtitle">Gerencie seu perfil e segurança.</p>
        </div>
      </div>

      {/* input de arquivo escondido, acionado pelos botões de foto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarSelected}
        style={{ display: 'none' }}
      />

      <div className="settings-grid">
        {/* Card Perfil */}
        <div className="settings-card settings-profile">
          <div className="settings-avatar-wrap">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="settings-avatar" />
            ) : (
              <div className="settings-avatar-placeholder">
                {getInitials(profile.name)}
              </div>
            )}
            <button
              type="button"
              className="settings-avatar-btn"
              aria-label="Trocar foto"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
            >
              <Camera size={16} />
            </button>
          </div>

          <div className="settings-profile-name">{profile.name || 'Minha Empresa'}</div>
          {profile.location && <div className="settings-profile-loc">{profile.location}</div>}

          <Button
            variant="secondary"
            size="sm"
            icon={Camera}
            onClick={() => fileInputRef.current?.click()}
            isLoading={isUploadingAvatar}
          >
            Alterar foto
          </Button>
          <p className="settings-avatar-hint">
            Esta imagem aparece no seu perfil e no topo dos orçamentos em PDF.
          </p>
        </div>

        {/* Coluna Dados + Segurança */}
        <div className="settings-right">
          {/* Bloco Dados */}
          <div className="settings-card">
            <Input
              label="Nome da Empresa"
              value={profile.name || ''}
              onChange={e => setProfile({ ...profile, name: e.target.value })}
            />
            <div style={{ position: 'relative' }}>
              <Input
                label="Cidade / Estado"
                icon={MapPin}
                placeholder="Belo Horizonte - MG"
                value={profile.location || ''}
                onChange={e => setProfile({ ...profile, location: e.target.value })}
              />
              <button
                type="button"
                onClick={handleUseGPS}
                disabled={isLocating}
                style={{
                  position: 'absolute', right: 8, top: 34, fontSize: 11,
                  color: 'var(--primary)', fontWeight: 700, cursor: isLocating ? 'wait' : 'pointer',
                  background: 'rgba(79,70,229,0.08)', padding: '4px 10px', borderRadius: 6,
                  border: 'none', opacity: isLocating ? 0.6 : 1,
                }}
              >
                {isLocating ? '⏳ Localizando…' : '📍 Usar GPS'}
              </button>
            </div>
            <div className="settings-actions-end">
              <Button onClick={handleSaveProfile} isLoading={isLoading}>Salvar Alterações</Button>
            </div>
          </div>

          {/* Bloco Segurança */}
          <div className="settings-card">
            <h2 className="settings-section-title">Segurança</h2>

            <div className="settings-row">
              <div>
                <div className="settings-row-title">Alterar senha</div>
                <div className="settings-row-desc">Enviaremos um link por e-mail.</div>
              </div>
              <Button variant="secondary" icon={Key} onClick={handleResetPassword}>Redefinir</Button>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-row-title">Encerrar sessão</div>
                <div className="settings-row-desc">Sair da conta neste dispositivo.</div>
              </div>
              <Button variant="secondary" className="btn-danger-outline" icon={LogOut} onClick={handleLogout}>
                Sair da Conta
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
