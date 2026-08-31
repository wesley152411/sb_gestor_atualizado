import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage';

export const metadata: Metadata = { title: 'Termos de Uso — SB Gestor' };
export default function TermsPage() { return <LegalDocumentPage documentKey="terms" />; }
