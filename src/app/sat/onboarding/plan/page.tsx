"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, Check } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

const videoSources = [
  "/videos/bg-video1.mp4",
  "/videos/bg-video2.mp4",
  "/videos/bg-video3.mp4",
  "/videos/bg-video4.mp4",
  "/videos/bg-video5.mp4",
];

const LEARNER_TYPES = [
  { emoji: "\u{1F441}\uFE0F", label: "Visual Learner", desc: "I learn best with diagrams & videos" },
  { emoji: "\u{1F442}", label: "Auditory Learner", desc: "I learn by listening & discussing" },
  { emoji: "\u{1F4D6}", label: "Reading/Writing", desc: "I prefer notes & textbooks" },
  { emoji: "\u{1F938}", label: "Kinesthetic", desc: "I learn by doing & practicing" },
  { emoji: "\u{1F465}", label: "Social Learner", desc: "I thrive in group settings" },
  { emoji: "\u{1F9D8}", label: "Solitary Learner", desc: "I focus best studying alone" },
];

const GRADE_OPTIONS = [
  "8th Grade",
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
  "College Freshman",
  "College Sophomore",
  "Other",
];

interface OnboardingData {
  name: string;
  grade: string;
  learnerTypes: string[];
  interests: string[];
  strugglingTopic: string;
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === current
              ? "w-6 bg-white"
              : i < current
                ? "w-2 bg-white/60"
                : "w-2 bg-white/20"
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPlanPage() {
  const router = useRouter();
  const { data: userData } = useCurrentUser();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    name: "",
    grade: "",
    learnerTypes: [],
    interests: [],
    strugglingTopic: "",
  });
  const [nameInitialized, setNameInitialized] = useState(false);

  useEffect(() => {
    if (!nameInitialized && userData?.user.displayName) {
      setData((d) => ({ ...d, name: userData.user.displayName! }));
      setNameInitialized(true);
    }
  }, [userData, nameInitialized]);
  const [interestInput, setInterestInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canContinue = useCallback(() => {
    switch (step) {
      case 0: return data.name.trim().length > 0;
      case 1: return data.grade.length > 0;
      case 2: return data.learnerTypes.length > 0;
      case 3: return data.interests.length > 0;
      case 4: return data.strugglingTopic.trim().length > 0;
      default: return false;
    }
  }, [step, data]);

  const complete = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/plan/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      router.push("/sat/onboarding/quiz");
    } catch {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step < 4) setStep(step + 1);
    else complete();
  };

  const toggleLearnerType = (label: string) => {
    setData((d) => ({
      ...d,
      learnerTypes: d.learnerTypes.includes(label)
        ? d.learnerTypes.filter((t) => t !== label)
        : [...d.learnerTypes, label],
    }));
  };

  const addInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !data.interests.includes(trimmed)) {
      setData((d) => ({ ...d, interests: [...d.interests, trimmed] }));
      setInterestInput("");
    }
  };

  const removeInterest = (interest: string) => {
    setData((d) => ({
      ...d,
      interests: d.interests.filter((i) => i !== interest),
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Video backgrounds */}
      {videoSources.map((src, i) => (
        <video
          key={i}
          src={src}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-600"
          style={{ opacity: i === step ? 1 : 0, zIndex: i === step ? 1 : 0 }}
          autoPlay
          loop
          muted
          playsInline
        />
      ))}

      {/* Dark overlay */}
      <div className="absolute inset-0 z-10 bg-black/60" />

      {/* Content */}
      <div className="relative z-20 flex w-full max-w-lg flex-col items-center px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4 }}
            className="w-full"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Step {step + 1} of 5
            </p>

            {step === 0 && (
              <>
                <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
                  What&apos;s Your Name?
                </h1>
                <p className="mb-1 text-white/70">Every great adventure begins with a name.</p>
                <p className="mb-8 font-semibold text-white">Let&apos;s get to know you.</p>
                <input
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-5 py-4 text-sm text-white placeholder-white/40 outline-none backdrop-blur-xl focus:border-white/30"
                  placeholder="Type your name..."
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, () => canContinue() && next())}
                  autoFocus
                />
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
                  Where Are You?
                </h1>
                <p className="mb-1 text-white/70">Your grade helps us tailor the journey perfectly.</p>
                <p className="mb-8 font-semibold text-white">Pick the one that fits.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {GRADE_OPTIONS.map((g) => (
                    <button
                      key={g}
                      className={`rounded-xl border px-5 py-3 text-sm font-medium transition-all ${
                        data.grade === g
                          ? "border-white/40 bg-white/20 text-white"
                          : "border-white/15 bg-black/40 text-white/70 hover:border-white/25 hover:bg-black/50"
                      }`}
                      onClick={() => setData({ ...data, grade: g })}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
                  How Do You Learn Best?
                </h1>
                <p className="mb-1 text-white/70">Pick as many as fit you. There&apos;s no wrong answer.</p>
                <p className="mb-8 font-semibold text-white">Everyone learns differently.</p>

                <div ref={dropdownRef} className="relative w-full max-w-md mx-auto">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-black/50 px-5 py-4 text-left text-sm text-white backdrop-blur-xl"
                  >
                    <span>
                      {data.learnerTypes.length === 0
                        ? "Select your learning styles..."
                        : `${data.learnerTypes.length} selected`}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-white/15 bg-black/80 backdrop-blur-2xl"
                    >
                      {LEARNER_TYPES.map((type) => {
                        const selected = data.learnerTypes.includes(type.label);
                        return (
                          <button
                            key={type.label}
                            onClick={() => toggleLearnerType(type.label)}
                            className={`flex w-full items-center gap-3 border-b border-white/10 px-5 py-3.5 text-left text-white transition-colors ${
                              selected ? "bg-orange-500/20" : "hover:bg-white/5"
                            }`}
                          >
                            <span className="text-lg">{type.emoji}</span>
                            <div className="flex-1">
                              <span className="text-sm font-medium">{type.label}</span>
                              <span className="ml-2 text-xs opacity-60">{type.desc}</span>
                            </div>
                            {selected && <Check size={16} className="text-primary" />}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}

                  {data.learnerTypes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.learnerTypes.map((t) => {
                        const type = LEARNER_TYPES.find((lt) => lt.label === t);
                        return (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white backdrop-blur"
                          >
                            {type?.emoji} {t}
                            <button onClick={() => toggleLearnerType(t)} className="opacity-60 hover:opacity-100">
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
                  What Are Your Interests?
                </h1>
                <p className="mb-1 text-white/70">Type anything you&apos;re passionate about and press Enter.</p>
                <p className="mb-8 font-semibold text-white">The more we know, the better.</p>
                <div className="flex w-full max-w-md mx-auto flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-black/50 px-4 py-3 backdrop-blur-xl">
                  {data.interests.map((interest) => (
                    <span
                      key={interest}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white"
                    >
                      {interest}
                      <button onClick={() => removeInterest(interest)} className="opacity-60 hover:opacity-100">
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="min-w-[120px] flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"
                    placeholder="e.g. Space, Music, Basketball..."
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, addInterest)}
                    autoFocus
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
                  What Topic Is Tough?
                </h1>
                <p className="mb-1 text-white/70">
                  Tell us what subject or concept you&apos;re struggling with. We&apos;ll build your path around it.
                </p>
                <p className="mb-8 font-semibold text-white">Don&apos;t worry, everyone has one.</p>
                <input
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-5 py-4 text-sm text-white placeholder-white/40 outline-none backdrop-blur-xl focus:border-white/30"
                  placeholder="e.g. Quadratic Equations, Essay Writing..."
                  value={data.strugglingTopic}
                  onChange={(e) => setData({ ...data, strugglingTopic: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, () => canContinue() && next())}
                  autoFocus
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex items-center gap-6">
          <button
            className="rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            onClick={next}
            disabled={!canContinue() || submitting}
          >
            {submitting ? "Saving..." : step === 4 ? "Let\u2019s Go" : "Continue"}
          </button>
          <ProgressDots total={5} current={step} />
        </div>
      </div>
    </div>
  );
}
