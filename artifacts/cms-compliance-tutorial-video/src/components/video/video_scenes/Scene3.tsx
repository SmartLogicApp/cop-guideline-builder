import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { springSnappy } from './shared';

export function Scene3() {
  return (
    <SceneLayout className="bg-secondary overflow-hidden text-white">
      {/* Dark background for contrast */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_transparent_70%)]" />
      
      <SafeFrame className="flex flex-col items-center justify-center p-16 z-10">
        
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-4xl font-display font-bold mb-16 text-center"
        >
          Verify citations directly from the eCFR
        </motion.h2>

        <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-8 flex flex-col gap-6 relative">
          
          {/* Unverified State */}
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.3, ...springSnappy }}
            className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
          >
            <div className="bg-warning/20 text-warning px-3 py-1 rounded text-sm font-mono font-bold">
              CONTENT PENDING VERIFICATION
            </div>
            <div className="text-secondary font-body">Generating draft policy...</div>
          </motion.div>

          {/* Verification Arrow */}
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 40, opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="w-1 bg-primary mx-auto my-2"
          />

          {/* Verified State */}
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1.5, ...springSnappy }}
            className="flex flex-col gap-3 p-6 bg-blue-50 rounded-lg border-2 border-primary relative overflow-hidden"
          >
            <div className="flex items-center gap-4">
              <div className="bg-success/20 text-success px-3 py-1 rounded text-sm font-mono font-bold flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                VERIFIED CITATION
              </div>
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="bg-primary text-white px-4 py-1 rounded-full text-sm font-bold flex items-center gap-2 cursor-pointer shadow-md"
              >
                <span>§482.21 QAPI</span>
                <span className="text-xs opacity-70">↗</span>
              </motion.div>
            </div>
            <p className="text-secondary font-body mt-2 text-lg">
              The hospital must develop, implement, and maintain an effective, ongoing, hospital-wide, data-driven QAPI program.
            </p>
            
            {/* Click animation indicator */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1, 1.5], opacity: [0, 0.5, 0] }}
              transition={{ delay: 2.5, duration: 1 }}
              className="absolute top-8 left-48 w-12 h-12 bg-primary rounded-full"
            />
          </motion.div>

        </div>
      </SafeFrame>
    </SceneLayout>
  );
}