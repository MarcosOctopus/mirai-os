/**
 * MIRAI OS — Intelligence Control
 * Sistema universal de gerenciamento de modelos de IA
 * 
 * Acesso: Exclusivo Super Admin (soDono=true)
 */

import { Metadata } from 'next';
import IntelligenceOverview from '@/components/admin/IntelligenceOverview';
import Shell from '@/components/dash/Shell';

export const metadata: Metadata = {
  title: 'Intelligence Control | MIRAI OS',
  description: 'Gerenciamento universal de modelos de IA',
};

export default async function IntelligencePage() {
  // Auth é verificada pelo Shell.tsx via soDono: true
  // Apenas donos da conta veem este item no menu
  
  return (
    <Shell titulo="Intelligence Control">
      <IntelligenceOverview />
    </Shell>
  );
}
