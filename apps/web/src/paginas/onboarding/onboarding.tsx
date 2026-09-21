import { OnboardingForm } from './onboarding-form';

export default function OnboardingPage() {
  return (
    <OnboardingForm
      orgName=""
      dailyHours={8}
      weeklyHours={40}
      timezone="America/Mexico_City"
    />
  );
}