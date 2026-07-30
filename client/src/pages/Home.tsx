import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import {
  MessageSquare,
  Search,
  Code2,
  Music,
  Image,
  Mic,
  Film,
  Users,
  ArrowRight,
  Zap,
  Sparkles,
} from "lucide-react";

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

  const features = [
    {
      icon: MessageSquare,
      title: "AI Chat Assistant",
      description: "Ask questions, upload files, generate reports and business plans",
    },
    {
      icon: Search,
      title: "Deep Research",
      description: "Search the web, get citations, create comprehensive research reports",
    },
    {
      icon: Code2,
      title: "AI App Builder",
      description: "Generate full project code from simple text descriptions",
    },
    {
      icon: Music,
      title: "Music Studio",
      description: "Generate lyrics, song structures, and production prompts",
    },
    {
      icon: Image,
      title: "Image Studio",
      description: "Create images, logos, thumbnails, and social media graphics",
    },
    {
      icon: Mic,
      title: "Voice Studio",
      description: "Transcribe audio and generate AI speech",
    },
    {
      icon: Film,
      title: "Music Video Generator",
      description: "Create complete music videos with subtitles automatically",
    },
    {
      icon: Users,
      title: "Character Memory",
      description: "Save and reuse characters across all your creations",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-white/10 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-cyan-400" />
            <span className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">IvorVerse AI</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="border-indigo-500/30 hover:bg-indigo-500/10">
              <a href="/login">Sign In</a>
            </Button>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <a href="/signup">Sign Up</a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="space-y-6">
          <div className="inline-block">
            <span className="text-sm font-semibold text-cyan-400 bg-cyan-400/10 px-4 py-2 rounded-full">
              Your Complete AI Operating System
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white">
            One AI.<br />Unlimited Creation.
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            IvorVerse AI combines chat, research, code generation, music, images, videos, and voice—everything you need for creative and productive work in one unified platform.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Button size="lg" asChild className="bg-indigo-600 hover:bg-indigo-700">
              <a href={getLoginUrl()}>
                Get Started <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
            <Button size="lg" variant="outline">
              Learn More
            </Button>
          </div>
        </div>

        {/* Hero Image/Graphic */}
        <div className="mt-16 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-lg blur-3xl opacity-20"></div>
          <div className="relative bg-gradient-to-br from-indigo-900/50 to-cyan-900/50 border border-indigo-500/20 rounded-lg p-12 backdrop-blur-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-square bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center border border-indigo-500/20">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            <Zap className="w-8 h-8 inline mr-2 text-cyan-400" />
            Powerful Features
          </h2>
          <p className="text-gray-300 text-lg">
            Everything you need to create, research, and build
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group bg-gradient-to-br from-indigo-900/50 to-cyan-900/50 border border-indigo-500/20 rounded-lg p-6 hover:border-indigo-500/50 transition-all hover:shadow-lg hover:shadow-indigo-500/20"
              >
                <Icon className="w-12 h-12 text-cyan-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-300 text-sm">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Simple Pricing</h2>
          <p className="text-gray-300 text-lg">
            Choose the plan that fits your needs
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Free Plan */}
          <div className="bg-gradient-to-br from-indigo-900/50 to-cyan-900/50 border border-indigo-500/20 rounded-lg p-8">
            <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
            <p className="text-gray-300 mb-6">Perfect for getting started</p>
            <div className="text-3xl font-bold text-white mb-6">$0<span className="text-lg text-gray-300">/mo</span></div>
            <ul className="space-y-3 mb-8 text-gray-300">
              <li>✓ 10 chat messages/day</li>
              <li>✓ 5 research queries/day</li>
              <li>✓ 2 image generations/day</li>
              <li>✓ 10MB file uploads</li>
            </ul>
            <Button variant="outline" className="w-full" asChild>
              <a href={getLoginUrl()}>Get Started</a>
            </Button>
          </div>

          {/* Pro Plan */}
          <div className="bg-gradient-to-br from-indigo-600/50 to-cyan-600/50 border border-indigo-400/50 rounded-lg p-8 relative">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white px-4 py-1 rounded-bl-lg rounded-tr-lg text-sm font-semibold">
              Popular
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
            <p className="text-gray-200 mb-6">For serious creators</p>
            <div className="text-3xl font-bold text-white mb-6">$29<span className="text-lg text-gray-300">/mo</span></div>
            <ul className="space-y-3 mb-8 text-gray-200">
              <li>✓ Unlimited chat messages</li>
              <li>✓ Unlimited research queries</li>
              <li>✓ 50 image generations/day</li>
              <li>✓ 100MB file uploads</li>
              <li>✓ 5 music/video generations/day</li>
              <li>✓ 5 character memory slots</li>
            </ul>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" asChild>
              <a href={getLoginUrl()}>Start Free Trial</a>
            </Button>
          </div>

          {/* Business Plan */}
          <div className="bg-gradient-to-br from-indigo-900/50 to-cyan-900/50 border border-indigo-500/20 rounded-lg p-8">
            <h3 className="text-2xl font-bold text-white mb-2">Business</h3>
            <p className="text-gray-300 mb-6">For teams and enterprises</p>
            <div className="text-3xl font-bold text-white mb-6">$99<span className="text-lg text-gray-300">/mo</span></div>
            <ul className="space-y-3 mb-8 text-gray-300">
              <li>✓ All Pro features</li>
              <li>✓ Team collaboration (5 users)</li>
              <li>✓ Shared workspaces</li>
              <li>✓ 20 music/video generations/day</li>
              <li>✓ Unlimited characters</li>
              <li>✓ Priority support</li>
            </ul>
            <Button variant="outline" className="w-full" asChild>
              <a href={getLoginUrl()}>Contact Sales</a>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-lg p-12">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Create?</h2>
          <p className="text-white/90 mb-8 text-lg">
            Join thousands of creators using IvorVerse AI to build amazing content
          </p>
          <Button size="lg" variant="secondary" asChild>
            <a href={getLoginUrl()}>
              Start for Free <ArrowRight className="w-4 h-4 ml-2" />
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
