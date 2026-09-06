import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { MedicalGrid, springSnappy } from './shared';

const workspaces = [
  { title: "Compliance Guidelines", desc: "Official CMS Conditions of Participation (CoPs).", color: "bg-blue-50 border-blue-200 text-blue-900" },
  { title: "Policy Templates", desc: "Draft policies meeting CMS requirements.", color: "bg-teal-50 border-teal-200 text-teal-900" },
  { title: "Inspection Readiness", desc: "Interactive unit-level checklists.", color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { title: "Gap Scanner", desc: "AI analysis of your policies vs CMS rules.", color: "bg-purple-50 border-purple-200 text-purple-900" },
];

export function Scene2() {
  return (
    <SceneLayout className="bg-bg-light overflow-hidden">
      <MedicalGrid />
      <SafeFrame className="flex flex-col items-center justify-center p-16">
        
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="text-center mb-16 z-10"
        >
          <h2 className="text-5xl font-display font-bold text-secondary mb-4">Four Core Workspaces</h2>
          <p className="text-2xl text-text-muted font-body max-w-2xl mx-auto">
            Everything you need for continuous CMS readiness.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-8 w-full max-w-5xl z-10">
          {workspaces.map((ws, i) => (
            <motion.div
              key={ws.title}
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, filter: "blur(5px)" }}
              transition={{ delay: 0.2 + i * 0.15, ...springSnappy }}
              className={`p-8 rounded-2xl border-2 ${ws.color} shadow-sm relative overflow-hidden`}
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-20 rounded-bl-full" />
              <h3 className="text-3xl font-bold font-body mb-3">{ws.title}</h3>
              <p className="text-xl opacity-80">{ws.desc}</p>
            </motion.div>
          ))}
        </div>

      </SafeFrame>
    </SceneLayout>
  );
}