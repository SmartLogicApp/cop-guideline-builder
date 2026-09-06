import { motion } from 'framer-motion';
import { SceneLayout, SafeFrame } from '@/lib/video';
import { MedicalGrid, springSnappy, textVariants } from './shared';

const providers = ["Hospital", "Critical Access Hospital (CAH)", "Skilled Nursing Facility (SNF)", "Home Health Agency (HHA)"];

export function Scene1() {
  return (
    <SceneLayout className="bg-bg-light overflow-hidden">
      <MedicalGrid />
      <SafeFrame className="flex flex-row items-center justify-between p-16">
        
        {/* Left Side: Copy */}
        <div className="flex-1 pr-16 z-10">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={springSnappy}
            className="w-16 h-1 bg-primary mb-6"
          />
          <motion.h2
            variants={textVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="text-5xl font-display font-bold text-secondary mb-6 leading-tight"
          >
            Start by selecting your <br/>
            <span className="text-primary">CMS Provider Type</span>
          </motion.h2>
          <motion.p
            variants={textVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            transition={{ delay: 0.2 }}
            className="text-2xl text-text-muted"
          >
            Every compliance requirement is automatically tailored to your specific facility.
          </motion.p>
        </div>

        {/* Right Side: UI Mockup */}
        <div className="flex-1 relative z-10 h-full flex flex-col justify-center" style={{ perspective: 1000 }}>
          <motion.div 
            className="bg-white rounded-2xl shadow-xl border border-bg-muted p-8 w-full max-w-md mx-auto"
            initial={{ y: 100, opacity: 0, rotateY: 20 }}
            animate={{ y: 0, opacity: 1, rotateY: 0 }}
            exit={{ scale: 0.9, opacity: 0, filter: "blur(10px)" }}
            transition={{ ...springSnappy, delay: 0.3 }}
          >
            <div className="text-sm font-mono text-text-muted mb-4 uppercase tracking-wider">Select Facility Type</div>
            <div className="flex flex-col gap-3">
              {providers.map((p, i) => (
                <motion.div
                  key={p}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.15 }}
                  className={`p-4 rounded-lg border-2 ${i === 0 ? 'border-primary bg-blue-50' : 'border-bg-muted'} flex items-center justify-between`}
                >
                  <span className={`font-body ${i === 0 ? 'text-primary font-semibold' : 'text-secondary'}`}>{p}</span>
                  {i === 0 && (
                    <motion.div 
                      initial={{ scale: 0 }} 
                      animate={{ scale: 1 }} 
                      transition={{ delay: 1.2, type: "spring" }}
                      className="w-4 h-4 rounded-full bg-primary"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
        
      </SafeFrame>
    </SceneLayout>
  );
}