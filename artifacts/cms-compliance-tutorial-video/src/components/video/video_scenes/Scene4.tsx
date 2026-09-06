import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { MedicalGrid, springSnappy } from './shared';

export function Scene4() {
  return (
    <SceneLayout className="bg-bg-light overflow-hidden">
      <MedicalGrid />
      
      <SafeFrame className="flex flex-row items-center p-16 gap-16">
        
        {/* Left side: Checklist UI */}
        <div className="flex-1 z-10 relative" style={{ perspective: 1000 }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0, rotateX: 20 }}
            animate={{ scale: 1, opacity: 1, rotateX: 0 }}
            exit={{ x: -100, opacity: 0 }}
            transition={springSnappy}
            className="bg-white rounded-xl shadow-2xl border border-bg-muted p-6"
          >
            <div className="border-b border-bg-muted pb-4 mb-4">
              <h3 className="text-xl font-bold text-secondary">Infection Control Walkthrough</h3>
              <p className="text-text-muted text-sm font-mono mt-1">Surgical Services Unit</p>
            </div>
            
            <div className="flex flex-col gap-4">
              {/* Item 1 - Ready */}
              <motion.div 
                initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                className="flex items-start gap-4 p-4 rounded bg-success/5 border border-success/20"
              >
                <div className="bg-success text-white text-xs font-bold px-2 py-1 rounded">READY</div>
                <div className="flex-1">
                  <p className="text-secondary font-medium">Sterile processing logs are up to date.</p>
                </div>
              </motion.div>

              {/* Item 2 - Gap with Note */}
              <motion.div 
                initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.6 }}
                className="flex items-start gap-4 p-4 rounded bg-error/5 border border-error/20 relative"
              >
                <div className="bg-error text-white text-xs font-bold px-2 py-1 rounded">GAP</div>
                <div className="flex-1">
                  <p className="text-secondary font-medium">Hand hygiene stations stocked in all bays.</p>
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} transition={{ delay: 1.5 }}
                    className="mt-3 bg-white p-3 rounded border border-error/30 text-sm text-secondary"
                  >
                    <span className="font-bold text-error mr-2">Follow-up:</span> 
                    Bay 4 dispenser needs repair. Work order #4912 submitted.
                  </motion.div>
                </div>
              </motion.div>

              {/* Item 3 - N/A */}
              <motion.div 
                initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.9 }}
                className="flex items-start gap-4 p-4 rounded bg-gray-50 border border-gray-200 opacity-60"
              >
                <div className="bg-gray-400 text-white text-xs font-bold px-2 py-1 rounded">N/A</div>
                <div className="flex-1">
                  <p className="text-secondary font-medium">Pediatric intubation kits checked.</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Right side: Copy */}
        <div className="flex-1 z-10">
          <motion.h2
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="text-5xl font-display font-bold text-secondary mb-6 leading-tight"
          >
            Assess readiness <br/>
            <span className="text-accent">item by item.</span>
          </motion.h2>
          
          <motion.ul className="space-y-4">
            {[
              "Mark findings as Ready, Gap, or N/A",
              "Flag specific items for follow-up",
              "Attach internal notes to build an audit trail"
            ].map((text, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2 + i * 0.2 }}
                className="text-2xl text-text-muted font-body flex items-center gap-3"
              >
                <div className="w-2 h-2 rounded-full bg-accent" />
                {text}
              </motion.li>
            ))}
          </motion.ul>
        </div>
        
      </SafeFrame>
    </SceneLayout>
  );
}