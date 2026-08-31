import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage';

export const metadata: Metadata = { title: 'Política de Privacidade — SB Gestor' };
export default function PrivacyPage() { return <LegalDocumentPage documentKey="privacy" />; }
