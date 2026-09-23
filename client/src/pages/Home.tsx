import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PLANS, planFeatureList } from "@shared/plans";
import { useLocation } from "wouter";
import {
  MessageSquare,
  Code2,
  Music,
  Image,
  Mic,
  Film,
  Users,
  ArrowRight,
  Sparkles,
  Store,
  Workflow,
  Lightbulb,
  Captions,
  Check,
} from "lucide-react";

// What people make with the music video pipeline. Deliberately broad: the
// feature is for anyone with something to promote, celebrate, or teach, not
// only musicians.
const useCases = [
  "Brand anthems & jingles",
  "Product launch promos",
  "Birthday & wedding songs",
  "Lessons kids remember",
  "Channel intros & outros",
  "Your next single",
];

// The four steps shown in the hero, from idea to getting paid.
const pipeline = [
  {
    icon: Lightbulb,
    label: "Describe your idea",
    detail: "“A 60-second anthem for my coffee shop's grand opening”",
  },
  { icon: Music, label: "Get an original song", detail: "Full track with vocals, written and performed by AI" },
  { icon: Film, label: "Turn it into a music video", detail: "AI-directed scenes with subtitles, rendered for you" },
  { icon: Store, label: "Share it or sell it", detail: "Post it anywhere, or sell it from your own store" },
];

// All shown at equal weight: every tool is part of the offer.
const features = [
  {
    icon: Music,
    title: "Songs with real vocals",
    description:
      "Not just lyrics: finished, original tracks in any genre. Jingles, theme songs, gifts, or your own music.",
  },
  {
    icon: Users,
    title: "Characters that stay consistent",
    description:
      "Create a character once, with a face, voice, and personality, and reuse it across images, voiceovers, and videos.",
  },
  {
    icon: Store,
    title: "Sell what you make",
    description:
      "Open a store in minutes. Sell downloads or monthly memberships, and get paid to your bank through Stripe.",
  },
  {
    icon: Workflow,
    title: "Agents & workflows",
    description:
      "Hand off multi-step jobs, like research → script → social posts, and run the whole chain with one click.",
  },
  {
    icon: Film,
    title: "Music videos",
    description:
      "Turn a song into a finished video with AI-directed scenes and automatic subtitles, rendered for you.",
  },
  {
    icon: Image,
    title: "Image Studio",
    description: "Create images, logos, thumbnails, and social media graphics, with your characters in them.",
  },
  {
    icon: Mic,
    title: "Voice Studio",
    description: "Natural-sounding voiceovers, accurate transcription, and hands-free voice conversations.",
  },
  {
    icon: Code2,
    title: "App Builder",
    description: "Describe an app in plain words and get it built and running with a live preview.",
  },
  {
    icon: MessageSquare,
    title: "Chat & Deep Research",
    description:
      "An assistant that searches the web, cites its sources, reads your files, and writes full reports.",
  },
];

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      // Redirect authenticated users to dashboard
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-white/10 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-400 shrink-0" />
            <span className="whitespace-nowrap text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              IvorVerse AI
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="#pricing" className="hidden sm:inline text-sm text-gray-300 hover:text-white px-3">
              Pricing
            </a>
            <Button asChild variant="outline" className="border-indigo-500/30 hover:bg-indigo-500/10">
              <a href="/login">Sign In</a>
            </Button>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <a href="/signup">Sign Up</a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 text-center lg:text-left">
            <span className="inline-block text-sm font-semibold text-cyan-400 bg-cyan-400/10 px-4 py-2 rounded-full">
              The AI creative studio
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
              <span className="whitespace-nowrap">Make it.</span> <span className="whitespace-nowrap">Film it.</span>
              <br />
              <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Sell it.</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-xl mx-auto lg:mx-0">
              Turn any idea into an original song and a finished music video. Design images, record voiceovers,
              build apps, research anything, and sell what you make, all in one place.
            </p>
            <div className="flex flex-wrap gap-4 justify-center lg:justify-start pt-2">
              <Button size="lg" asChild className="bg-indigo-600 hover:bg-indigo-700">
                <a href="/signup">
                  Start Creating Free <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => document.getElementById("music-videos")?.scrollIntoView({ behavior: "smooth" })}
              >
                See How It Works
              </Button>
            </div>
          </div>

          {/* Idea → song → video → sale */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-2xl blur-3xl opacity-20" />
            <ol className="relative bg-gradient-to-br from-indigo-900/60 to-cyan-900/40 border border-indigo-500/20 rounded-2xl p-6 sm:p-8 backdrop-blur-sm space-y-5">
              {pipeline.map((step, i) => {
                const Icon = step.icon;
                return (
                  <li key={step.label} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-11 h-11 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-cyan-400" />
                      </div>
                      {i < pipeline.length - 1 && <div className="w-px flex-1 bg-indigo-500/30 mt-2" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Step {i + 1}</p>
                      <p className="text-white font-semibold">{step.label}</p>
                      <p className="text-sm text-gray-300">{step.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      {/* Flagship: music videos */}
      <section id="music-videos" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 scroll-mt-20">
        <div className="bg-gradient-to-br from-indigo-600/30 to-cyan-600/20 border border-indigo-400/30 rounded-2xl p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-cyan-400">
                <Film className="w-6 h-6" />
                <span className="text-sm font-semibold uppercase tracking-wider">Music videos</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white">From one sentence to a finished music video</h2>
              <p className="text-gray-200 text-lg">
                You don't need a band, a camera, or editing skills. Describe what you want and IvorVerse writes the
                song, sings it, plans the scenes, creates the visuals, adds subtitles, and renders the video.
              </p>
              <ul className="space-y-2 text-gray-200">
                {[
                  { icon: Music, text: "Original song with vocals, not stock music" },
                  { icon: Sparkles, text: "AI-directed scenes that follow the lyrics" },
                  { icon: Captions, text: "Subtitles added automatically" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-cyan-400 shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-200 mb-3">What people make with it</p>
              <div className="flex flex-wrap gap-2">
                {useCases.map((useCase) => (
                  <span
                    key={useCase}
                    className="text-sm text-white bg-white/10 border border-white/15 px-3 py-1.5 rounded-full"
                  >
                    {useCase}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-300 mt-6">
                Made for businesses, teachers, YouTubers, and musicians alike. The free plan includes a music video
                every month.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 scroll-mt-20">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">Everything in one studio</h2>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto">
            Nine tools that work together, and every plan includes all of them.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group bg-gradient-to-br from-indigo-900/50 to-cyan-900/50 border border-indigo-500/20 rounded-lg p-6 hover:border-indigo-500/50 transition-all hover:shadow-lg hover:shadow-indigo-500/20 flex gap-5"
              >
                <Icon className="w-10 h-10 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">{feature.title}</h3>
                  <p className="text-gray-300 text-sm">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 scroll-mt-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Simple Pricing</h2>
          <p className="text-gray-300 text-lg">One subscription covers every studio. Start free and upgrade anytime.</p>
        </div>

        {/* Generated from shared/plans.ts, the same limits the server enforces */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[PLANS.free, PLANS.pro, PLANS.business].map((plan) => {
            const featured = plan.id === "pro";
            return (
              <div
                key={plan.id}
                className={
                  featured
                    ? "bg-gradient-to-br from-indigo-600/50 to-cyan-600/50 border border-indigo-400/50 rounded-lg p-8 relative"
                    : "bg-gradient-to-br from-indigo-900/50 to-cyan-900/50 border border-indigo-500/20 rounded-lg p-8"
                }
              >
                {featured && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white px-4 py-1 rounded-bl-lg rounded-tr-lg text-sm font-semibold">
                    Popular
                  </div>
                )}
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <p className={`${featured ? "text-gray-200" : "text-gray-300"} mb-6`}>{plan.description}</p>
                <div className="text-3xl font-bold text-white mb-6">
                  ${plan.price}
                  <span className="text-lg text-gray-300">/mo</span>
                </div>
                <ul className={`space-y-3 mb-8 ${featured ? "text-gray-200" : "text-gray-300"}`}>
                  {planFeatureList(plan).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="w-4 h-4 mt-1 text-cyan-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={featured ? "default" : "outline"}
                  className={featured ? "w-full bg-indigo-600 hover:bg-indigo-700" : "w-full"}
                  asChild
                >
                  {/* Paid plans carry the choice through signup to Stripe checkout */}
                  <a href={plan.price === 0 ? "/signup" : `/signup?plan=${plan.id}`}>
                    {plan.price === 0 ? "Start Free" : `Choose ${plan.name}`}
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-lg p-12">
          <h2 className="text-3xl font-bold text-white mb-4">Your first music video is on us</h2>
          <p className="text-white/90 mb-8 text-lg">
            Sign up free and make a song and a music video this month. No card required.
          </p>
          <Button size="lg" variant="secondary" asChild>
            <a href="/signup">
              Start Creating Free <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
          <p>&copy; 2026 IvorVerse Technologies. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
