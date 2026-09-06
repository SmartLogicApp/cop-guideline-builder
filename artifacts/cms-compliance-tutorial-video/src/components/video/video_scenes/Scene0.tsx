import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { Logo, MedicalGrid, AnimatedPulse, springSmooth, textVariants } from './shared';

export function Scene0() {
  return (
    <SceneLayout className="bg-bg-light overflow-hidden flex items-center justify-center relative">
      <MedicalGrid />
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatedPulse />
      </div>

      <SafeFrame className="flex flex-col items-center justify-center z-10 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 1.5, opacity: 0, filter: "blur(10px)" }}
          transition={springSmooth}
          className="mb-8"
        >
          <Logo className="w-32 h-32" />
        </motion.div>

        <motion.h1
          variants={textVariants}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, y: -20 }}
          transition={{ ...springSmooth, delay: 0.3 }}
          className="text-6xl font-display font-bold text-secondary mb-4 tracking-tight"
        >
          CMS Compliance Suite
        </motion.h1>

        <motion.p
          variants={textVariants}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, y: -20 }}
          transition={{ ...springSmooth, delay: 0.5 }}
          className="text-2xl font-body text-text-muted"
        >
          Staff Training & Workflow Guide
        </motion.p>
      </SafeFrame>
    </SceneLayout>
  );
}
