import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { MedicalGrid, springSnappy } from './shared';

const steps = [
  "Confirm Provider",
  "Verify Citations",
  "Review Policy",
  "Assess Gaps",
  "Export Results",
  "Clear Session"
];

export function Scene8() {
  return (
    <SceneLayout className="bg-secondary overflow-hidden text-white">
      <MedicalGrid />
      <div className="absolute inset-0 bg-secondary opacity-90" />
      
      <SafeFrame className="flex flex-col items-center justify-center p-16 z-10">
        
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-display font-bold mb-16 text-center"
        >
          The Recommended Workflow
        </motion.h2>

        <div className="flex flex-nowrap justify-center gap-6 max-w-6xl relative">
          
          {/* Connector line */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 2, ease: "easeInOut" }}
            className="absolute top-[24px] left-0 h-1 bg-primary/30 -z-10 -translate-y-1/2"
          />

          {steps.map((step, i) => (
            <motion.div
              key={step}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.3, ...springSnappy }}
              className="flex flex-col items-center gap-3 w-[140px]"
            >
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-xl border-4 border-secondary shadow-lg z-10">
                {i + 1}
              </div>
              <div className="text-center font-body text-sm font-medium text-blue-100">
                {step}
              </div>
            </motion.div>
          ))}
          
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.5 }}
          className="mt-16 bg-white/10 px-6 py-3 rounded-full text-lg border border-white/20"
        >
          Follow these steps for a complete compliance audit.
        </motion.div>

      </SafeFrame>
    </SceneLayout>
  );
}