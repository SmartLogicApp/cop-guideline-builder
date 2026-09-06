import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { Logo, springSmooth } from './shared';

export function Scene9() {
  return (
    <SceneLayout className="bg-bg-light overflow-hidden flex items-center justify-center">
      <SafeFrame className="flex flex-col items-center justify-center z-10">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springSmooth}
          className="mb-8"
        >
          <Logo className="w-40 h-40" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springSmooth, delay: 0.3 }}
          className="text-4xl font-display font-bold text-secondary text-center tracking-tight"
        >
          CMS Compliance Suite
        </motion.h1>
      </SafeFrame>
    </SceneLayout>
  );
}