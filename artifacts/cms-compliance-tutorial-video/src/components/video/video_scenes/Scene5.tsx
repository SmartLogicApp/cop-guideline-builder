import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { MedicalGrid, springSnappy } from './shared';

export function Scene5() {
  return (
    <SceneLayout className="bg-primary overflow-hidden text-white">
      <MedicalGrid />
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-secondary opacity-90" />
      
      <SafeFrame className="flex flex-col items-center justify-center p-16 z-10">
        
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-display font-bold mb-4">Gap Scanner & Action Plans</h2>
          <p className="text-xl opacity-80 max-w-2xl mx-auto">
            Scan your existing policies to uncover missing CMS requirements instantly.
          </p>
        </motion.div>

        <div className="flex gap-8 w-full max-w-5xl">
          
          {/* Scan Results */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, x: -50 }}
            animate={{ scale: 1, opacity: 1, x: 0 }}
            transition={{ delay: 0.3, ...springSnappy }}
            className="flex-1 bg-white rounded-xl p-6 shadow-2xl text-secondary"
          >
            <h3 className="font-bold text-lg mb-4 border-b pb-2">Analysis Results</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-success/10 rounded">
                <span className="font-medium">Governing Body Oversight</span>
                <span className="bg-success text-white text-xs px-2 py-1 rounded font-bold">MET</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-warning/10 rounded">
                <span className="font-medium">Contracted Services</span>
                <span className="bg-warning text-white text-xs px-2 py-1 rounded font-bold">WEAK</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-error/10 rounded">
                <span className="font-medium">Emergency Preparedness</span>
                <span className="bg-error text-white text-xs px-2 py-1 rounded font-bold">MISSING</span>
              </div>
            </div>
          </motion.div>

          {/* Action Plan Generation */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, x: 50 }}
            animate={{ scale: 1, opacity: 1, x: 0 }}
            transition={{ delay: 1.2, ...springSnappy }}
            className="flex-1 bg-blue-50 rounded-xl p-6 shadow-2xl text-secondary flex flex-col justify-center items-center relative overflow-hidden"
          >
            {/* scanning effect */}
            <motion.div
              initial={{ top: "-10%" }}
              animate={{ top: "110%" }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 w-full h-1 bg-accent/50 shadow-[0_0_15px_rgba(42,133,143,0.8)] z-20"
            />
            
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.5, type: "spring" }}
              className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4 text-white text-2xl z-10"
            >
              ⚡
            </motion.div>
            <h3 className="font-bold text-xl mb-2 text-center z-10">Generating Action Plan</h3>
            <p className="text-center text-sm opacity-80 z-10">
              Drafting remediation steps based on 4 missing citations...
            </p>
          </motion.div>

        </div>
      </SafeFrame>
    </SceneLayout>
  );
}