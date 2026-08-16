import { LandingNav } from '@/components/landing/LandingNav';
import {
  LandingHero,
  LandingValueBand,
  LandingBenefits,
  LandingHowItWorks,
  LandingMarketplaceBanner,
  LandingCTA,
  LandingFooter,
} from '@/components/landing/sections';
import { LandingTestimonials } from '@/components/landing/LandingTestimonials';

export default function LandingPage() {
  return (
    <div className="lp">
      <LandingNav />
      <LandingHero />
      <LandingValueBand />
      <LandingBenefits />
      <LandingHowItWorks />
      <LandingMarketplaceBanner />
      {/* Depoimentos: componente pronto — só aparece quando houver depoimentos reais */}
      <LandingTestimonials items={[]} />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
