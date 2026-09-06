import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { MedicalGrid, springSnappy } from './shared';

export function Scene7() {
  return (
    <SceneLayout className="bg-bg-light overflow-hidden">
      <MedicalGrid />
      <SafeFrame className="flex flex-row items-center justify-between p-16 gap-16">
        
        {/* Left Side: Copy */}
        <div className="flex-1 z-10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 64 }}
            exit={{ width: 0 }}
            className="h-1 bg-accent mb-6"
          />
          <motion.h2
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-display font-bold text-secondary mb-6 leading-tight"
          >
            Billing & Administration
          </motion.h2>
          
          <motion.ul className="space-y-6">
            <motion.li initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="text-xl text-text-muted flex gap-4">
              <span className="text-accent font-bold">1.</span>
              The Billing tab displays your current subscription status and AI token usage.
            </motion.li>
            <motion.li initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="text-xl text-text-muted flex gap-4">
              <span className="text-accent font-bold">2.</span>
              Checkout and payments are <span className="font-bold text-secondary">not currently live</span>.
            </motion.li>
            <motion.li initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }} className="text-xl text-text-muted flex gap-4">
              <span className="text-accent font-bold">3.</span>
              The Admin panel is restricted to system administrators only.
            </motion.li>
          </motion.ul>
        </div>

        {/* Right Side: UI */}
        <div className="flex-1 z-10 relative">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, ...springSnappy }}
            className="bg-white rounded-xl shadow-xl border border-bg-muted p-8"
          >
            <div className="flex justify-between items-center border-b pb-4 mb-6">
              <h3 className="font-bold text-lg text-secondary">Plan Usage</h3>
              <span className="bg-primary/10 text-primary px-3 py-1 rounded text-sm font-bold">FACILITY</span>
            </div>
            
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-sm text-text-muted">
                 <span>AI usage this period</span>
                 <span>$12.60 billed</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }} animate={{ width: "84%" }} transition={{ delay: 1, duration: 1 }}
                  className="bg-primary h-full rounded-full" 
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
               <span className="text-sm text-text-muted block mb-2">1.5× raw Anthropic token cost</span>
              <button className="w-full bg-gray-300 text-gray-500 py-2 rounded font-medium cursor-not-allowed opacity-70">
                 Checkout Unavailable
              </button>
            </div>
          </motion.div>
        </div>

      </SafeFrame>
    </SceneLayout>
  );
}