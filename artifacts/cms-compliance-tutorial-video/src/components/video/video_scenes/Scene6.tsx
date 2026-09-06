import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { MedicalGrid, springSnappy } from './shared';

export function Scene6() {
  return (
    <SceneLayout className="bg-bg-light overflow-hidden">
      <MedicalGrid />
      <SafeFrame className="flex flex-col items-center justify-center p-16 z-10 text-center">
        
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={springSnappy}
          className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center mb-8 shadow-lg relative"
        >
          {/* Lock icon */}
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          
          <motion.div
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 bg-secondary rounded-full -z-10"
          />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, ...springSnappy }}
          className="text-5xl font-display font-bold text-secondary mb-6"
        >
          Your policy data is <span className="text-error">never saved.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, ...springSnappy }}
          className="text-2xl text-text-muted max-w-3xl mb-12 font-body"
        >
          For security, all pasted policies and gap scans are temporary session data.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, ...springSnappy }}
          className="bg-white px-8 py-6 rounded-xl border-l-4 border-warning shadow-lg flex items-center gap-6 text-left"
        >
          <div className="text-4xl">⏱️</div>
          <div>
            <h3 className="font-bold text-secondary text-xl mb-1">30-Minute Expiry</h3>
            <p className="text-text-muted">Data clears automatically after 30 minutes or when you click "Clear Data". <br/>Always export your results when finished.</p>
          </div>
        </motion.div>
        
      </SafeFrame>
    </SceneLayout>
  );
}