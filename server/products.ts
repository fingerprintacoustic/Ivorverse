/**
 * Stripe Products and Pricing Configuration
 * Define all subscription tiers and pricing here
 */

export const SUBSCRIPTION_TIERS = {
  FREE: {
    id: "free",
    name: "Free",
    description: "Perfect for getting started",
    price: 0,
    features: [
      "5 AI Chat conversations/month",
      "1 Research report/month",
      "5 Image generations/month",
      "2 Music generations/month",
      "2 Voice transcriptions/month",
      "1 Video generation/month",
      "Basic character support",
      "Community support",
    ],
    limits: {
      chatConversations: 5,
      researchReports: 1,
      imageGenerations: 5,
      musicGenerations: 2,
      voiceTranscriptions: 2,
      videoGenerations: 1,
      characters: 1,
    },
  },
  PRO: {
    id: "pro",
    name: "Pro",
    description: "For serious creators",
    price: 29, // $29/month
    stripePriceId: process.env.STRIPE_PRICE_PRO || "price_pro_placeholder",
    features: [
      "Unlimited AI Chat conversations",
      "50 Research reports/month",
      "100 Image generations/month",
      "50 Music generations/month",
      "50 Voice transcriptions/month",
      "10 Video generations/month",
      "Unlimited characters",
      "Priority support",
      "Advanced analytics",
      "Custom API access",
    ],
    limits: {
      chatConversations: -1, // unlimited
      researchReports: 50,
      imageGenerations: 100,
      musicGenerations: 50,
      voiceTranscriptions: 50,
      videoGenerations: 10,
      characters: -1, // unlimited
    },
  },
  BUSINESS: {
    id: "business",
    name: "Business",
    description: "For teams and enterprises",
    price: 99, // $99/month
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS || "price_business_placeholder",
    features: [
      "Everything in Pro",
      "Unlimited all features",
      "Team collaboration (up to 10 users)",
      "Advanced security & SSO",
      "Dedicated account manager",
      "Custom integrations",
      "White-label options",
      "SLA guarantee",
      "24/7 priority support",
      "Custom training",
    ],
    limits: {
      chatConversations: -1, // unlimited
      researchReports: -1,
      imageGenerations: -1,
      musicGenerations: -1,
      voiceTranscriptions: -1,
      videoGenerations: -1,
      characters: -1,
      teamMembers: 10,
    },
  },
};

export const getSubscriptionTier = (tierId: string) => {
  const tier = Object.values(SUBSCRIPTION_TIERS).find((t) => t.id === tierId);
  if (!tier) {
    throw new Error(`Unknown subscription tier: ${tierId}`);
  }
  return tier;
};

export const getFeatureLimit = (tierId: string, feature: keyof typeof SUBSCRIPTION_TIERS.FREE.limits) => {
  const tier = getSubscriptionTier(tierId);
  return tier.limits[feature] ?? 0;
};

export const hasUnlimitedFeature = (tierId: string, feature: keyof typeof SUBSCRIPTION_TIERS.FREE.limits) => {
  const limit = getFeatureLimit(tierId, feature);
  return limit === -1;
};
