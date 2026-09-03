"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-[#f0f6fc] mb-2">Welcome to Studio</h1>
          <p className="text-[#8b949e] text-lg mb-10">
            Build, configure, and deploy AI teaching agents. Start a lesson with an agent or manage them in the admin panel.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link
              href="/studio/lesson"
              className="group p-8 rounded-2xl border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50 transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 flex items-center justify-center mb-4 group-hover:bg-[#58a6ff]/20 transition-colors">
                <svg className="w-6 h-6 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#f0f6fc] mb-2">Start a Lesson</h2>
              <p className="text-[#8b949e] text-sm">
                Pick an agent, choose a topic, and launch an interactive teaching session.
              </p>
            </Link>

            <Link
              href="/studio/admin"
              className="group p-8 rounded-2xl border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50 transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 flex items-center justify-center mb-4 group-hover:bg-[#58a6ff]/20 transition-colors">
                <svg className="w-6 h-6 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#f0f6fc] mb-2">Manage Agents</h2>
              <p className="text-[#8b949e] text-sm">
                Create, configure, and deploy AI agents with custom prompts and settings.
              </p>
            </Link>

            <Link
              href="/studio/history"
              className="group p-8 rounded-2xl border border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/50 transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 flex items-center justify-center mb-4 group-hover:bg-[#58a6ff]/20 transition-colors">
                <svg className="w-6 h-6 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#f0f6fc] mb-2">Session History</h2>
              <p className="text-[#8b949e] text-sm">
                Review past lessons, track progress, and resume where you left off.
              </p>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
