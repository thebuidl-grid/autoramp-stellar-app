"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
// We'll create these components next
import BusinessDetailsForm from "@/components/merchant/onboarding/BusinessDetailsForm";
import DocumentationForm from "@/components/merchant/onboarding/DocumentationForm";
import DirectorsForm from "@/components/merchant/onboarding/DirectorsForm";
import ShareholdersForm from "@/components/merchant/onboarding/ShareholdersForm";
import BankAccountForm from "@/components/merchant/onboarding/BankAccountForm";

const STEPS = [
    "Business Details",
    "Documentation",
    "Directors Data",
    "Shareholders Data",
    "Settlement Bank Account",
];

export default function MerchantOnboardingPage() {
    const [currentStep, setCurrentStep] = useState(1);
    const router = useRouter();
    const { user } = useAuthStore();

    const progress = (currentStep / STEPS.length) * 100;

    const nextStep = () => {
        if (currentStep < STEPS.length) {
            setCurrentStep(prev => prev + 1);
        } else {
            // Completed last step
            router.push("/merchant/dashboard");
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
        }
    };

    return (
        <div className="min-h-screen bg-black/90 text-white flex flex-col items-center py-12 px-4">
            <div className="w-full max-w-3xl space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Merchant Onboarding</h1>
                    <p className="text-gray-400">Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1]}</p>
                    <Progress value={progress} className="h-2" />
                </div>

                <div className="bg-gray-900/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
                    {currentStep === 1 && <BusinessDetailsForm onNext={nextStep} />}
                    {currentStep === 2 && <DocumentationForm onNext={nextStep} onBack={prevStep} />}
                    {currentStep === 3 && <DirectorsForm onNext={nextStep} onBack={prevStep} />}
                    {currentStep === 4 && <ShareholdersForm onNext={nextStep} onBack={prevStep} />}
                    {currentStep === 5 && <BankAccountForm onNext={nextStep} onBack={prevStep} />}
                </div>
            </div>
        </div>
    );
}
